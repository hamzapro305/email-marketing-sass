import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { InjectQueue } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Job, Queue } from 'bullmq';
import { Model } from 'mongoose';
import { AuditStage, STAGE_ORDER, StageLogger } from '../audits/audit.types';
import { AuditsService } from '../audits/audits.service';
import { LeadAuditDocument } from '../audits/lead-audit.schema';
import { Lead, LeadDocument, LeadStatus } from '../leads/lead.schema';
import {
  Campaign,
  CampaignDocument,
} from '../campaigns/campaign.schema';
import { SEND_QUEUE, SendJobData } from '../campaigns/queue.constants';
import { deriveCompanyDomain } from '../leads/lead-parser';
import { LlmAccountsService } from '../llm-accounts/llm-accounts.service';
import { SettingsService } from '../settings/settings.service';
import { LlmWirePayload } from '../ai/ai.types';
import { PIPELINE_QUEUE, PipelineJobData, SEND_JOB_OPTS } from './pipeline.constants';
import { PipelineService } from './pipeline.service';
import { CampaignCountersService } from './campaign-counters.service';
import { CompanyResearchService } from './stages/company-research.service';
import { RivalsService } from './stages/rivals.service';
import { AnalysisService } from './stages/analysis.service';
import { EmailComposeService } from '../ai/email-compose.service';

// Read at import time so the decorator is configured before the worker starts.
const CONCURRENCY = parseInt(process.env.PIPELINE_CONCURRENCY ?? '5', 10);

/**
 * Consumes the shared audit pipeline queue. One job = one stage of one lead's
 * audit; finishing a stage enqueues the next, so BullMQ spreads a campaign's
 * work evenly across every worker replica and a crash mid-audit loses at most
 * one stage (which retries).
 *
 * Idempotency: every job carries the runId it belongs to. A job whose run is
 * no longer current is dropped; a retried job whose stage already completed
 * just re-enqueues the next stage.
 */
@Processor(PIPELINE_QUEUE, { concurrency: CONCURRENCY })
export class PipelineProcessor extends WorkerHost {
  private readonly logger = new Logger(PipelineProcessor.name);
  private readonly instanceId: string;

  constructor(
    @InjectModel(Lead.name) private readonly leadModel: Model<LeadDocument>,
    @InjectModel(Campaign.name)
    private readonly campaignModel: Model<CampaignDocument>,
    @InjectQueue(SEND_QUEUE) private readonly sendQueue: Queue<SendJobData>,
    private readonly pipeline: PipelineService,
    private readonly audits: AuditsService,
    private readonly counters: CampaignCountersService,
    private readonly research: CompanyResearchService,
    private readonly rivals: RivalsService,
    private readonly analysis: AnalysisService,
    private readonly emailCompose: EmailComposeService,
    private readonly llmAccounts: LlmAccountsService,
    private readonly settings: SettingsService,
    config: ConfigService,
  ) {
    super();
    this.instanceId = config.get<string>('app.instanceId') ?? 'worker';
  }

  async process(job: Job<PipelineJobData>): Promise<void> {
    const { leadId, runId, stage } = job.data;

    const [lead, audit] = await Promise.all([
      this.leadModel.findById(leadId).exec(),
      this.audits.getCurrentRun(leadId, runId),
    ]);
    if (!lead) {
      this.logger.warn(`[${this.instanceId}] lead ${leadId} vanished — dropping job.`);
      return;
    }
    if (!audit) {
      // A newer run superseded this one; its jobs are stale by definition.
      return;
    }
    if (audit.stages[stage]?.status === 'completed') {
      await this.advance(job.data);
      return;
    }

    const trace = this.audits.stageLogger(leadId, runId, stage);
    try {
      await this.audits.beginStage(leadId, runId, stage);
      if (job.attemptsMade > 0) {
        trace.log('info', `Retrying (attempt ${job.attemptsMade + 1})`);
      }
      const patch = await this.runStage(stage, lead, audit, job.data, trace.log);
      await trace.flush();
      await this.audits.completeStage(leadId, runId, stage, patch);
      await this.advance(job.data);
    } catch (err) {
      trace.log('error', 'Stage failed', err instanceof Error ? err.message : String(err));
      await trace.flush();
      await this.handleStageError(job, lead, err);
    }
  }

  private async runStage(
    stage: AuditStage,
    lead: LeadDocument,
    audit: LeadAuditDocument,
    data: PipelineJobData,
    log: StageLogger,
  ): Promise<Record<string, unknown>> {
    switch (stage) {
      case AuditStage.Process:
        return this.stageProcess(lead, log);
      case AuditStage.Research:
        return this.stageResearch(lead, data, log);
      case AuditStage.Rivals:
        return this.stageRivals(lead, audit, log);
      case AuditStage.Scrape:
        return this.stageScrape(lead, audit, log);
      case AuditStage.Analyze:
        return this.stageAnalyze(lead, audit, data, log);
      case AuditStage.Email:
        return this.stageEmail(lead, audit, data, log);
      default:
        throw new Error(`Unknown pipeline stage: ${stage}`);
    }
  }

  /** Normalize the lead and derive its research key (company domain). */
  private async stageProcess(
    lead: LeadDocument,
    log: StageLogger,
  ): Promise<Record<string, unknown>> {
    const emailDomain = lead.email.split('@')[1] ?? '';
    if (!lead.companyDomain) {
      lead.companyDomain = deriveCompanyDomain(lead.email, lead.website);
    }
    if (lead.companyDomain) {
      log(
        'success',
        `Company domain resolved to ${lead.companyDomain}`,
        lead.website
          ? `Taken from the website field (${lead.website}).`
          : `Taken from the email address (@${emailDomain}).`,
      );
    } else {
      log(
        'warn',
        'No company domain could be determined',
        `@${emailDomain} is a personal/free mail provider and no website was supplied. ` +
          'Without a domain there is nothing to scrape, so research, competitor discovery and ' +
          'analysis will have no evidence. Add a Website (or Company + Website) to the lead ' +
          'and re-run the audit.',
      );
    }
    if (!lead.website && lead.companyDomain) {
      lead.website = `https://${lead.companyDomain}`;
      log('info', `No website given — assuming ${lead.website}`);
    }
    lead.status = LeadStatus.Researching;
    lead.errorMessage = null;
    await lead.save();
    return {};
  }

  /**
   * Company research (domain-cached). ONE combined AI "brief" call returns
   * both the profile and the proposed rivals, so the separate rivals stage
   * below costs no model call at all.
   */
  private async stageResearch(
    lead: LeadDocument,
    data: PipelineJobData,
    log: StageLogger,
  ): Promise<Record<string, unknown>> {
    if (!lead.companyDomain) {
      // Personal email + no website: nothing to research. Later stages
      // degrade gracefully (no rivals, heuristics-only analysis).
      log('warn', 'Skipped — no company domain to research (see Lead processing).');
      return {};
    }
    const llm = await this.resolveLlm(data.sessionId);
    if (!llm) {
      log(
        'warn',
        'No AI provider configured for this workspace',
        'Add a provider under Settings → AI providers. Until then every AI step falls back to heuristics.',
      );
    }
    const result = await this.research.getOrBuild({
      domain: lead.companyDomain,
      website: lead.website || `https://${lead.companyDomain}`,
      companyName: lead.company,
      industry: lead.industry,
      location: lead.location,
      llm,
      log,
    });
    return {
      company: result.profile,
      companySignals: result.signals,
      companyPages: result.pages,
      rivals: result.rivals,
    };
  }

  /** Confirm the rivals discovered by the brief (cache read — no AI call). */
  private async stageRivals(
    lead: LeadDocument,
    audit: LeadAuditDocument,
    log: StageLogger,
  ): Promise<Record<string, unknown>> {
    if (audit.rivals && audit.rivals.length > 0) {
      log(
        'success',
        `${audit.rivals.length} competitor${audit.rivals.length === 1 ? '' : 's'} confirmed from the company brief`,
        audit.rivals.map((r) => `${r.name} — ${r.website}`).join('\n'),
      );
      return {};
    }
    if (!lead.companyDomain) {
      log('warn', 'Skipped — no company domain, so no competitors can be discovered.');
      return {};
    }
    const rivals = await this.rivals.getCachedRivals(lead.companyDomain);
    if (rivals.length > 0) {
      log(
        'success',
        `${rivals.length} competitor${rivals.length === 1 ? '' : 's'} found in the research cache`,
        rivals.map((r) => `${r.name} — ${r.website}`).join('\n'),
      );
      return { rivals };
    }
    log(
      'warn',
      'No competitors identified',
      audit.company?.engine === 'fallback'
        ? 'Competitor discovery needs an AI provider — the brief was heuristic, and we never invent competitors.'
        : 'The AI brief did not propose any competitor with a valid, distinct website.',
    );
    return {};
  }

  /** Scrape rival websites for comparable evidence. */
  private async stageScrape(
    lead: LeadDocument,
    audit: LeadAuditDocument,
    log: StageLogger,
  ): Promise<Record<string, unknown>> {
    if (!audit.rivals || audit.rivals.length === 0) {
      log('warn', 'Skipped — no competitors to scrape.');
      return {};
    }
    const scraped = await this.rivals.scrapeRivals(
      lead.companyDomain,
      audit.rivals,
      log,
    );
    const pages = scraped.reduce((n, r) => n + r.pages.length, 0);
    log(
      pages ? 'success' : 'warn',
      `Collected ${pages} page${pages === 1 ? '' : 's'} of competitor evidence across ${scraped.length} site${scraped.length === 1 ? '' : 's'}`,
    );
    return { rivals: scraped };
  }

  /** AI analysis of everything collected so far. */
  private async stageAnalyze(
    lead: LeadDocument,
    audit: LeadAuditDocument,
    data: PipelineJobData,
    log: StageLogger,
  ): Promise<Record<string, unknown>> {
    await this.setLeadStatus(lead, LeadStatus.Analyzing);
    const result = await this.analysis.analyze(
      lead,
      audit,
      await this.resolveLlm(data.sessionId),
      log,
    );
    return { analysis: result };
  }

  /** Compose the personalized email from the finished audit. */
  private async stageEmail(
    lead: LeadDocument,
    audit: LeadAuditDocument,
    data: PipelineJobData,
    log: StageLogger,
  ): Promise<Record<string, unknown>> {
    await this.setLeadStatus(lead, LeadStatus.Writing);

    const campaign = data.campaignId
      ? await this.campaignModel.findById(data.campaignId).exec()
      : null;
    const settings = await this.settings.getForSession(data.sessionId);

    const email = await this.emailCompose.compose({
      lead,
      campaign: {
        name: campaign?.name ?? 'Lead audit',
        description: campaign?.description,
      },
      settings,
      audit,
      llm: await this.resolveLlm(data.sessionId),
      log,
    });

    lead.generatedSubject = email.subject;
    lead.generatedBody = email.body;
    await lead.save();
    return { email };
  }

  /** Chain to the next stage; after the last one, hand off to sending. */
  private async advance(data: PipelineJobData): Promise<void> {
    const idx = STAGE_ORDER.indexOf(data.stage);
    const next = STAGE_ORDER[idx + 1];

    if (next) {
      await this.pipeline.enqueueStage({ ...data, stage: next });
      return;
    }

    // Pipeline finished — the audit is complete.
    await this.audits.completeRun(data.leadId, data.runId);
    await this.audits.log(
      data.leadId,
      data.runId,
      'run',
      'success',
      data.send && data.campaignId
        ? 'Audit complete — email queued for sending'
        : 'Audit complete — lead is ready to review',
    );

    if (data.send && data.campaignId) {
      await this.sendQueue.add(
        'send',
        { campaignId: data.campaignId, leadId: data.leadId },
        { ...SEND_JOB_OPTS, jobId: `${data.runId}:send:${data.leadId}` },
      );
    } else {
      await this.leadModel
        .updateOne(
          { _id: data.leadId },
          { $set: { status: LeadStatus.Ready, errorMessage: null } },
        )
        .exec();
      this.logger.log(`[${this.instanceId}] audit ready for lead ${data.leadId}.`);
    }
  }

  private async handleStageError(
    job: Job<PipelineJobData>,
    lead: LeadDocument,
    err: unknown,
  ): Promise<void> {
    const { leadId, runId, stage } = job.data;
    const message = err instanceof Error ? err.message : String(err);
    const maxAttempts = job.opts.attempts ?? 1;
    const isFinalAttempt = job.attemptsMade >= maxAttempts - 1;

    if (!isFinalAttempt) {
      await this.audits.noteStageError(leadId, runId, stage, message);
      throw err instanceof Error ? err : new Error(message);
    }

    this.logger.warn(
      `[${this.instanceId}] stage ${stage} failed permanently for ${lead.email}: ${message}`,
    );
    await this.audits.failStage(leadId, runId, stage, message);
    await this.leadModel
      .updateOne(
        { _id: leadId },
        { $set: { status: LeadStatus.Failed, errorMessage: message.slice(0, 500) } },
      )
      .exec();
    // Keep campaign completion detection correct: a lead that failed before
    // sending still counts as processed.
    if (job.data.send && job.data.campaignId) {
      await this.counters.bumpFailed(job.data.campaignId);
    }
  }

  private async setLeadStatus(
    lead: LeadDocument,
    status: LeadStatus,
  ): Promise<void> {
    if (lead.status !== status) {
      await this.leadModel
        .updateOne({ _id: lead._id }, { $set: { status } })
        .exec();
      lead.status = status;
    }
  }

  private async resolveLlm(
    sessionId: string,
  ): Promise<LlmWirePayload | undefined> {
    const cfg = await this.llmAccounts.getDefaultConfig(sessionId);
    return cfg
      ? (this.llmAccounts.toWirePayload(cfg) as unknown as LlmWirePayload)
      : undefined;
  }
}
