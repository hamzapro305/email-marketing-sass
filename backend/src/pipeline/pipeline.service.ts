import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { InjectModel } from '@nestjs/mongoose';
import { Queue } from 'bullmq';
import { Model, Types } from 'mongoose';
import { AuditStage } from '../audits/audit.types';
import { AuditsService } from '../audits/audits.service';
import { Lead, LeadDocument, LeadStatus } from '../leads/lead.schema';
import {
  PIPELINE_JOB_OPTS,
  PIPELINE_QUEUE,
  PipelineJobData,
} from './pipeline.constants';

const CHUNK = 1_000;

/**
 * Entry point into the audit pipeline: creates a run (a fresh audit document
 * per lead) and enqueues each lead's first stage. Job ids embed the runId +
 * stage + lead so a double-click or a crashed replica can never enqueue the
 * same work twice.
 */
@Injectable()
export class PipelineService {
  private readonly logger = new Logger(PipelineService.name);

  constructor(
    @InjectQueue(PIPELINE_QUEUE)
    private readonly queue: Queue<PipelineJobData>,
    @InjectModel(Lead.name)
    private readonly leadModel: Model<LeadDocument>,
    private readonly audits: AuditsService,
  ) {}

  /** Start (or restart) the audit pipeline for one lead. */
  async startForLead(
    lead: LeadDocument,
    opts: { send: boolean },
  ): Promise<string> {
    const runId = new Types.ObjectId().toString();
    await this.audits.startRun(lead, runId, opts.send);
    await this.leadModel
      .updateOne(
        { _id: lead._id },
        { $set: { status: LeadStatus.Queued, errorMessage: null } },
      )
      .exec();
    await this.enqueueStage({
      leadId: lead._id.toString(),
      campaignId: lead.campaignId?.toString() ?? null,
      sessionId: lead.sessionId ?? '',
      runId,
      stage: AuditStage.Process,
      send: opts.send,
    });
    this.logger.log(`Audit run ${runId} started for lead ${lead.email}.`);
    return runId;
  }

  /**
   * Start the pipeline for a whole campaign's pending leads. Batched: audits
   * are reset via bulkWrite and jobs enqueued via addBulk, both in chunks, so
   * a 10k-lead start stays fast and memory-flat.
   */
  async startForCampaign(
    campaignId: string,
    sessionId: string,
    leads: Array<Pick<LeadDocument, '_id' | 'campaignId' | 'sessionId'>>,
    runId: string,
  ): Promise<number> {
    for (let i = 0; i < leads.length; i += CHUNK) {
      const chunk = leads.slice(i, i + CHUNK);

      await this.audits.startRunBulk(
        chunk.map((l) => ({
          leadId: l._id,
          campaignId: l.campaignId ?? null,
          sessionId,
        })),
        runId,
        true,
      );

      await this.queue.addBulk(
        chunk.map((l) => {
          const data: PipelineJobData = {
            leadId: l._id.toString(),
            campaignId: campaignId,
            sessionId,
            runId,
            stage: AuditStage.Process,
            send: true,
          };
          return {
            name: AuditStage.Process,
            data,
            opts: { ...PIPELINE_JOB_OPTS, jobId: this.jobId(data) },
          };
        }),
      );
    }
    this.logger.log(
      `▶ Campaign ${campaignId}: enqueued ${leads.length} audit pipelines (run ${runId}).`,
    );
    return leads.length;
  }

  /** Enqueue one stage job (used by the processor to chain stages). */
  async enqueueStage(data: PipelineJobData): Promise<void> {
    await this.queue.add(data.stage, data, {
      ...PIPELINE_JOB_OPTS,
      jobId: this.jobId(data),
    });
  }

  /** Live queue depth, surfaced by the health endpoint. */
  async queueCounts(): Promise<Record<string, number>> {
    return this.queue.getJobCounts('waiting', 'active', 'delayed', 'failed');
  }

  private jobId(data: PipelineJobData): string {
    return `${data.runId}:${data.stage}:${data.leadId}`;
  }
}
