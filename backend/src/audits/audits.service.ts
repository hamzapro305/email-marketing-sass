import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AuditRunStatus, LeadAudit, LeadAuditDocument } from './lead-audit.schema';
import {
  AuditLogEntry,
  AuditLogLevel,
  AuditStage,
  StageLogger,
  StageStatus,
  freshStages,
} from './audit.types';

/** Oldest entries are dropped beyond this, keeping the document bounded. */
const MAX_ACTIVITY = 200;
import { Lead, LeadDocument } from '../leads/lead.schema';

/**
 * Owns the LeadAudit documents: run lifecycle, per-stage bookkeeping, and the
 * read API for the Lead page. All writes are atomic partial updates keyed by
 * (leadId, runId) so retried/stale jobs can never corrupt a newer run.
 */
@Injectable()
export class AuditsService {
  constructor(
    @InjectModel(LeadAudit.name)
    private readonly auditModel: Model<LeadAuditDocument>,
    @InjectModel(Lead.name)
    private readonly leadModel: Model<LeadDocument>,
  ) {}

  /** Reset (or create) the audit for a new pipeline run. */
  async startRun(
    lead: LeadDocument,
    runId: string,
    send: boolean,
  ): Promise<void> {
    await this.auditModel
      .findOneAndUpdate(
        { leadId: lead._id },
        {
          $set: {
            campaignId: lead.campaignId,
            sessionId: lead.sessionId ?? '',
            runId,
            send,
            status: AuditRunStatus.Running,
            stages: freshStages(),
            company: null,
            companySignals: null,
            companyPages: [],
            rivals: [],
            analysis: null,
            email: null,
            activity: [],
            error: null,
            completedAt: null,
          },
        },
        { upsert: true },
      )
      .exec();
  }

  /** Bulk variant of {@link startRun} for campaign starts (one bulkWrite). */
  async startRunBulk(
    leads: Array<{
      leadId: Types.ObjectId;
      campaignId: Types.ObjectId | null;
      sessionId: string;
    }>,
    runId: string,
    send: boolean,
  ): Promise<void> {
    if (leads.length === 0) return;
    await this.auditModel.bulkWrite(
      leads.map((l) => ({
        updateOne: {
          filter: { leadId: l.leadId },
          update: {
            $set: {
              campaignId: l.campaignId,
              sessionId: l.sessionId,
              runId,
              send,
              status: AuditRunStatus.Running,
              stages: freshStages(),
              company: null,
              companySignals: null,
              companyPages: [],
              rivals: [],
              analysis: null,
              email: null,
              activity: [],
              error: null,
              completedAt: null,
            },
          },
          upsert: true,
        },
      })),
      { ordered: false },
    );
  }

  /** The audit for a lead, scoped to its owner session. */
  async getForLead(sessionId: string, leadId: string): Promise<LeadAudit> {
    if (!Types.ObjectId.isValid(leadId)) {
      throw new NotFoundException('Lead not found');
    }
    const audit = await this.auditModel
      .findOne({ leadId: new Types.ObjectId(leadId), sessionId })
      .lean()
      .exec();
    if (!audit) {
      throw new NotFoundException('No audit exists for this lead yet.');
    }
    return audit;
  }

  /** Load the current audit for a job; null when the run is stale. */
  async getCurrentRun(
    leadId: string,
    runId: string,
  ): Promise<LeadAuditDocument | null> {
    return this.auditModel
      .findOne({ leadId: new Types.ObjectId(leadId), runId })
      .exec();
  }

  /** Mark a stage as started (idempotent under retries). */
  async beginStage(leadId: string, runId: string, stage: AuditStage): Promise<void> {
    await this.setStage(leadId, runId, stage, 'running', {
      [`stages.${stage}.startedAt`]: new Date(),
      [`stages.${stage}.error`]: null,
    });
  }

  /** Mark a stage as completed, optionally patching audit result fields. */
  async completeStage(
    leadId: string,
    runId: string,
    stage: AuditStage,
    resultPatch: Record<string, unknown> = {},
  ): Promise<void> {
    const audit = await this.getCurrentRun(leadId, runId);
    const startedAt = audit?.stages?.[stage]?.startedAt;
    const durationMs = startedAt
      ? Date.now() - new Date(startedAt).getTime()
      : null;
    await this.setStage(leadId, runId, stage, 'completed', {
      [`stages.${stage}.completedAt`]: new Date(),
      [`stages.${stage}.durationMs`]: durationMs,
      ...resultPatch,
    });
  }

  /** Mark a stage (and the whole run) as failed. */
  async failStage(
    leadId: string,
    runId: string,
    stage: AuditStage,
    error: string,
  ): Promise<void> {
    await this.setStage(leadId, runId, stage, 'failed', {
      [`stages.${stage}.completedAt`]: new Date(),
      [`stages.${stage}.error`]: error.slice(0, 1000),
      status: AuditRunStatus.Failed,
      error: error.slice(0, 1000),
      completedAt: new Date(),
    });
  }

  /** Record a transient stage error without failing the run (retry upcoming). */
  async noteStageError(
    leadId: string,
    runId: string,
    stage: AuditStage,
    error: string,
  ): Promise<void> {
    await this.auditModel
      .updateOne(
        { leadId: new Types.ObjectId(leadId), runId },
        { $set: { [`stages.${stage}.error`]: error.slice(0, 1000) } },
      )
      .exec();
  }

  /** Append one entry to the run's activity trace. */
  async log(
    leadId: string,
    runId: string,
    stage: AuditLogEntry['stage'],
    level: AuditLogLevel,
    message: string,
    detail?: string,
  ): Promise<void> {
    const entry: AuditLogEntry = {
      at: new Date(),
      stage,
      level,
      message: message.slice(0, 500),
      ...(detail ? { detail: detail.slice(0, 4_000) } : {}),
    };
    await this.auditModel
      .updateOne(
        { leadId: new Types.ObjectId(leadId), runId },
        { $push: { activity: { $each: [entry], $slice: -MAX_ACTIVITY } } },
      )
      .exec();
  }

  /**
   * A {@link StageLogger} bound to one stage of one run. Writes are chained so
   * entries land in call order and appear live; `flush()` awaits them all.
   * Logging never throws into the pipeline — a lost trace line is not worth
   * failing an audit over.
   */
  stageLogger(
    leadId: string,
    runId: string,
    stage: AuditLogEntry['stage'],
  ): { log: StageLogger; flush: () => Promise<void> } {
    let chain: Promise<void> = Promise.resolve();
    const log: StageLogger = (level, message, detail) => {
      chain = chain
        .then(() => this.log(leadId, runId, stage, level, message, detail))
        .catch(() => undefined);
    };
    return { log, flush: () => chain };
  }

  /** Finish the run successfully. */
  async completeRun(leadId: string, runId: string): Promise<void> {
    await this.auditModel
      .updateOne(
        { leadId: new Types.ObjectId(leadId), runId },
        {
          $set: {
            status: AuditRunStatus.Completed,
            error: null,
            completedAt: new Date(),
          },
        },
      )
      .exec();
  }

  private async setStage(
    leadId: string,
    runId: string,
    stage: AuditStage,
    status: StageStatus,
    extra: Record<string, unknown>,
  ): Promise<void> {
    await this.auditModel
      .updateOne(
        { leadId: new Types.ObjectId(leadId), runId },
        { $set: { [`stages.${stage}.status`]: status, ...extra } },
      )
      .exec();
  }
}
