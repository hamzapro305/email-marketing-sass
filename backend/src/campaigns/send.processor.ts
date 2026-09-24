import { Logger } from '@nestjs/common';
import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Job, Queue } from 'bullmq';
import { Model } from 'mongoose';
import { Campaign, CampaignDocument } from './campaign.schema';
import { Lead, LeadDocument, LeadStatus } from '../leads/lead.schema';
import { SEND_QUEUE, SendJobData } from './queue.constants';
import { SEND_JOB_OPTS } from '../pipeline/pipeline.constants';
import { MailSenderService } from '../email-agent/mail-sender.service';
import { SmtpAccountsService } from '../smtp-accounts/smtp-accounts.service';
import { SettingsService } from '../settings/settings.service';
import { EmailComposeService } from '../ai/email-compose.service';
import { CampaignCountersService } from '../pipeline/campaign-counters.service';
import { SuppressionsService } from '../suppressions/suppressions.service';
import { RedisCoordinationService } from '../redis/redis-coordination.service';
import { cleanEmail } from '../ai/email-text';

// Per-replica worker concurrency, read at import time so the decorator is
// configured before the worker starts. Total throughput ≈ replicas × this.
const CONCURRENCY = parseInt(process.env.SEND_CONCURRENCY ?? '3', 10);

/**
 * Consumes the `campaign-send` queue — the final stage of the pipeline. The
 * email was already composed from the lead's audit by the pipeline's email
 * stage; this worker only delivers it over the session's SMTP account. (If a
 * lead somehow arrives without a composed email, one is generated on the spot
 * so a send is never blocked.)
 */
@Processor(SEND_QUEUE, { concurrency: CONCURRENCY })
export class SendProcessor extends WorkerHost {
  private readonly logger = new Logger(SendProcessor.name);
  private readonly instanceId: string;
  private readonly publicUrl: string;
  private readonly hourlyLimit: number;

  constructor(
    @InjectModel(Campaign.name)
    private readonly campaignModel: Model<CampaignDocument>,
    @InjectModel(Lead.name)
    private readonly leadModel: Model<LeadDocument>,
    @InjectQueue(SEND_QUEUE) private readonly sendQueue: Queue<SendJobData>,
    private readonly mailSender: MailSenderService,
    private readonly smtpAccounts: SmtpAccountsService,
    private readonly emailCompose: EmailComposeService,
    private readonly settings: SettingsService,
    private readonly counters: CampaignCountersService,
    private readonly suppressions: SuppressionsService,
    private readonly coordination: RedisCoordinationService,
    config: ConfigService,
  ) {
    super();
    this.instanceId = config.get<string>('app.instanceId') ?? 'backend';
    this.publicUrl = config.get<string>('app.publicUrl') ?? '';
    this.hourlyLimit = config.get<number>('app.sendHourlyLimit') ?? 0;
  }

  async process(job: Job<SendJobData>): Promise<void> {
    const { campaignId, leadId } = job.data;

    const [lead, campaign] = await Promise.all([
      this.leadModel.findById(leadId).exec(),
      this.campaignModel.findById(campaignId).exec(),
    ]);
    if (!lead) {
      this.logger.warn(`[${this.instanceId}] lead ${leadId} vanished — skipping.`);
      return;
    }

    // Resolve the SMTP account this campaign's session sends from. Starting a
    // campaign is gated on having one, but guard here too — if it's gone, fail
    // the lead cleanly instead of crashing the worker.
    const sessionId = campaign?.sessionId ?? '';
    const smtp = await this.smtpAccounts.getDefaultConfig(sessionId);
    if (!smtp) {
      lead.status = LeadStatus.Failed;
      lead.errorMessage = 'No SMTP account configured.';
      await lead.save();
      await this.counters.bumpFailed(campaignId);
      return;
    }

    // Never email someone who unsubscribed — skip before anything else.
    if (await this.suppressions.isSuppressed(sessionId, lead.email)) {
      lead.status = LeadStatus.Failed;
      lead.errorMessage = 'Skipped — recipient has unsubscribed.';
      await lead.save();
      await this.counters.bumpFailed(campaignId);
      this.logger.log(`[${this.instanceId}] skipped suppressed ${lead.email}.`);
      return;
    }

    // Deliverability pacing: cap sends per SMTP account per hour so campaigns
    // drip instead of burst (bursts are a classic spam-filter trigger). When
    // the bucket is exhausted, push this send into the next window.
    if (!(await this.coordination.takeHourlyToken(`send:${smtp.id}`, this.hourlyLimit))) {
      const delay = 5 * 60_000 + Math.floor(Math.random() * 15 * 60_000);
      await this.sendQueue.add('send', job.data, {
        ...SEND_JOB_OPTS,
        delay,
        jobId: `defer:${leadId}:${Date.now()}`,
      });
      await this.leadModel
        .updateOne({ _id: lead._id }, { $set: { status: LeadStatus.Queued } })
        .exec();
      this.logger.log(
        `[${this.instanceId}] hourly send limit reached for account ${smtp.id} — ` +
          `deferring ${lead.email} by ${Math.round(delay / 60_000)}m.`,
      );
      return;
    }

    // The pipeline's email stage normally composed this already; the safety
    // net keeps legacy/edge leads sendable.
    if (!lead.generatedSubject || !lead.generatedBody) {
      const email = await this.emailCompose.compose({
        lead,
        campaign: {
          name: campaign?.name ?? '',
          description: campaign?.description,
        },
        settings: await this.settings.getForSession(sessionId),
        audit: null,
      });
      lead.generatedSubject = email.subject;
      lead.generatedBody = email.body;
    }

    lead.status = LeadStatus.Sending;
    lead.errorMessage = null;
    await lead.save();

    // Unsubscribe link: signed token, no auth required to redeem. The footer
    // is added at send time only — the stored/displayed email stays clean.
    const token = this.suppressions.token({ sessionId, email: lead.email });
    const unsubscribeUrl = this.publicUrl
      ? `${this.publicUrl}/api/unsubscribe?token=${token}`
      : undefined;
    const footer = unsubscribeUrl
      ? `\n\n\nDon't want emails like this? Unsubscribe: ${unsubscribeUrl}`
      : `\n\n\nDon't want emails like this? Just reply "unsubscribe".`;

    const result = await this.mailSender.sendToLead(
      smtp,
      lead,
      {
        // Re-cleaned at send time so drafts stored before the dash rule
        // (or edited since) still go out clean.
        subject: cleanEmail({ subject: lead.generatedSubject, body: '' }).subject,
        body: cleanEmail({ subject: '', body: lead.generatedBody }).body + footer,
      },
      { unsubscribeUrl },
    );

    if (result.success) {
      lead.status = LeadStatus.Sent;
      lead.sentAt = new Date();
      lead.errorMessage = null;
      await lead.save();
      // Counters are incremented exactly once per lead — on success here, or on
      // the final failed attempt below — so completion detection stays correct.
      await this.counters.bumpSent(campaignId);
      this.logger.log(
        `[${this.instanceId}] sent ${lead.email} (campaign ${campaignId}).`,
      );
      return;
    }

    const maxAttempts = job.opts.attempts ?? 1;
    const isFinalAttempt = job.attemptsMade >= maxAttempts - 1;
    const error = result.error ?? 'Unknown error';

    if (!isFinalAttempt) {
      // Transient failure — throw so BullMQ retries (at most 2 auto-retries;
      // see SEND_JOB_OPTS). Counters untouched; the lead stays `sending`.
      throw new Error(error);
    }

    lead.status = LeadStatus.Failed;
    lead.errorMessage = error;
    await lead.save();
    await this.counters.bumpFailed(campaignId);
    this.logger.warn(
      `[${this.instanceId}] failed ${lead.email} after ${maxAttempts} attempts (campaign ${campaignId}).`,
    );
  }
}
