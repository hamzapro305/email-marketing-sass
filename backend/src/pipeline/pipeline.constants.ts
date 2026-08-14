import { AuditStage } from '../audits/audit.types';

/**
 * The BullMQ queue that runs the lead audit pipeline. One job = one stage of
 * one lead's audit; completing a stage enqueues the next, so a 10k-lead
 * campaign becomes a stream of small, retryable, evenly distributed jobs.
 */
export const PIPELINE_QUEUE = 'lead-pipeline';

export interface PipelineJobData {
  leadId: string;
  campaignId: string | null;
  sessionId: string;
  /** Identifies the run — jobs from an older run are ignored. */
  runId: string;
  stage: AuditStage;
  /** true → the pipeline ends by enqueueing the send job. */
  send: boolean;
}

/** Default per-job retry policy for pipeline stages. */
export const PIPELINE_JOB_OPTS = {
  attempts: 3,
  backoff: { type: 'exponential' as const, delay: 3_000 },
  removeOnComplete: 2_000,
  removeOnFail: 2_000,
};

/**
 * Send retry policy. `attempts` counts TOTAL tries: 1 initial + at most 2
 * automatic retries — a failed send must never be hammered further.
 */
export const SEND_JOB_OPTS = {
  attempts: 3,
  backoff: { type: 'exponential' as const, delay: 2_000 },
  removeOnComplete: 1_000,
  removeOnFail: 1_000,
};
