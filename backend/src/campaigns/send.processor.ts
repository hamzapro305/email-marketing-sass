import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Job } from 'bullmq';
import { Model } from 'mongoose';
import { Campaign, CampaignDocument, CampaignStatus } from './campaign.schema';
import { Lead, LeadDocument, LeadStatus } from '../leads/lead.schema';
import { SEND_QUEUE, SendJobData } from './queue.constants';
import { MailSenderService } from '../email-agent/mail-sender.service';
import { EmailWriterService } from '../email-writer/email-writer.service';
import { SettingsService } from '../settings/settings.service';
import { SmtpAccountsService } from '../smtp-accounts/smtp-accounts.service';
import { ComposedEmail } from '../email-writer/email-writer.interface';

// Per-replica worker concurrency, read at import time so the decorator is
// configured before the worker starts. Total throughput ≈ replicas × this.
const CONCURRENCY = parseInt(process.env.SEND_CONCURRENCY ?? '3', 10);

/**
 * Consumes the shared `campaign-send` queue. Because an instance of this worker
 * runs inside every backend container, BullMQ hands each job to whichever
 * replica is free — that is what actually spreads a 10k-lead campaign across
 * all containers in parallel (nginx only balances the HTTP API).
 */
@Processor(SEND_QUEUE, { concurrency: CONCURRENCY })
export class SendProcessor extends WorkerHost {
  private readonly logger = new Logger(SendProcessor.name);
  private readonly instanceId: string;

  constructor(
    @InjectModel(Campaign.name)
    private readonly campaignModel: Model<CampaignDocument>,
    @InjectModel(Lead.name)
    private readonly leadModel: Model<LeadDocument>,
    private readonly mailSender: MailSenderService,
    private readonly smtpAccounts: SmtpAccountsService,
    private readonly writer: EmailWriterService,
    private readonly settings: SettingsService,
    config: ConfigService,
  ) {
    super();
    this.instanceId = config.get<string>('app.instanceId') ?? 'backend';
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
    const smtp = await this.smtpAccounts.getDefaultConfig(
      campaign?.sessionId ?? '',
    );
    if (!smtp) {
      lead.status = LeadStatus.Failed;
      lead.errorMessage = 'No SMTP account configured.';
      await lead.save();
      await this.bumpCounters(campaignId, { failedCount: 1 });
      return;
    }

    // Phase 1 — the AI writes this lead's email. Surface it live in the UI.
    lead.status = LeadStatus.Writing;
    lead.errorMessage = null;
    await lead.save();

    // The AI writer composes a personalized subject + body for this lead
    // (real AI when the writer service is reachable, local fallback otherwise).
    const email = await this.compose(lead, campaign);
    lead.generatedSubject = email.subject;
    lead.generatedBody = email.body;

    // Phase 2 — deliver the composed email over the session's SMTP account.
    lead.status = LeadStatus.Sending;
    await lead.save();

    const result = await this.mailSender.sendToLead(smtp, lead, email);

    if (result.success) {
      lead.status = LeadStatus.Sent;
      lead.sentAt = new Date();
      lead.errorMessage = null;
      await lead.save();
      // Counters are incremented exactly once per lead — on success here, or on
      // the final failed attempt below — so completion detection stays correct.
      await this.bumpCounters(campaignId, { sentCount: 1 });
      this.logger.log(
        `[${this.instanceId}] sent ${lead.email} (campaign ${campaignId}).`,
      );
      return;
    }

    const maxAttempts = job.opts.attempts ?? 1;
    const isFinalAttempt = job.attemptsMade >= maxAttempts - 1;
    const error = result.error ?? 'Unknown error';

    if (!isFinalAttempt) {
      // Transient failure — throw so BullMQ retries. Do NOT touch counters; the
      // lead stays `sending` and gets another shot on a (possibly other) replica.
      throw new Error(error);
    }

    lead.status = LeadStatus.Failed;
    lead.errorMessage = error;
    await lead.save();
    await this.bumpCounters(campaignId, { failedCount: 1 });
    this.logger.warn(
      `[${this.instanceId}] failed ${lead.email} after ${maxAttempts} attempts (campaign ${campaignId}).`,
    );
  }

  /** Compose the email for a lead using the session's AI writing settings. */
  private async compose(
    lead: LeadDocument,
    campaign: CampaignDocument | null,
  ): Promise<ComposedEmail> {
    const sessionId = campaign?.sessionId ?? '';
    const settings = await this.settings.getForSession(sessionId);
    return this.writer.compose({
      sessionId,
      lead: {
        email: lead.email,
        firstName: lead.firstName,
        lastName: lead.lastName,
        company: lead.company,
        title: lead.title,
      },
      campaign: {
        name: campaign?.name ?? '',
        // No predefined subject — the AI writer generates the subject itself.
        description: campaign?.description,
      },
      settings,
    });
  }

  /**
   * Atomically increment campaign counters, then mark the campaign completed
   * exactly once when every lead has been processed. The conditional filter on
   * `status: Running` guarantees only one replica flips it to `completed`.
   */
  private async bumpCounters(
    campaignId: string,
    inc: { sentCount?: number; failedCount?: number },
  ): Promise<void> {
    const updated = await this.campaignModel
      .findByIdAndUpdate(campaignId, { $inc: inc }, { new: true })
      .exec();
    if (!updated) return;

    const processed = updated.sentCount + updated.failedCount;
    if (processed >= updated.totalLeads) {
      const res = await this.campaignModel
        .updateOne(
          { _id: campaignId, status: CampaignStatus.Running },
          { $set: { status: CampaignStatus.Completed, completedAt: new Date() } },
        )
        .exec();
      if (res.modifiedCount > 0) {
        this.logger.log(
          `■ Campaign ${campaignId} completed — sent ${updated.sentCount}, failed ${updated.failedCount}.`,
        );
      }
    }
  }
}
