import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, Types } from 'mongoose';
import {
  AuditAnalysis,
  AuditLogEntry,
  AuditStages,
  CompanyProfileData,
  GeneratedEmailData,
  RivalData,
  ScrapedPageRef,
  freshStages,
} from './audit.types';
import { WebsiteSignals } from '../scraper/scraper.types';

export type LeadAuditDocument = HydratedDocument<LeadAudit>;

export enum AuditRunStatus {
  Running = 'running',
  Completed = 'completed',
  Failed = 'failed',
}

/**
 * The complete structured audit of one lead — everything the pipeline learned:
 * company research, discovered rivals, scraped evidence, AI analysis, and the
 * generated email. One document per lead; re-running the pipeline resets it
 * under a new `runId`.
 *
 * Research/analysis payloads are stored as plain objects (typed via the
 * interfaces in `audit.types.ts`): they are written only by the pipeline and
 * rendered by the UI, so full sub-schemas would add ceremony without safety.
 */
@Schema({ timestamps: true, collection: 'lead_audits' })
export class LeadAudit {
  @Prop({ type: Types.ObjectId, ref: 'Lead', required: true, unique: true })
  leadId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Campaign', default: null, index: true })
  campaignId: Types.ObjectId | null;

  @Prop({ type: String, required: true, index: true })
  sessionId: string;

  /** Identifies one pipeline run; stale jobs from older runs are ignored. */
  @Prop({ type: String, required: true })
  runId: string;

  /** Whether this run ends with sending the email (campaign) or not (audit-only). */
  @Prop({ type: Boolean, default: true })
  send: boolean;

  @Prop({
    type: String,
    enum: Object.values(AuditRunStatus),
    default: AuditRunStatus.Running,
    index: true,
  })
  status: AuditRunStatus;

  /** Per-stage execution state (status, timing, error). */
  @Prop({ type: MongooseSchema.Types.Mixed, default: freshStages })
  stages: AuditStages;

  /** The lead's company: research cache key + AI profile. */
  @Prop({ type: MongooseSchema.Types.Mixed, default: null })
  company: CompanyProfileData | null;

  /** Deterministic signals computed from the company's own website. */
  @Prop({ type: MongooseSchema.Types.Mixed, default: null })
  companySignals: WebsiteSignals | null;

  /** Pages scraped from the company's own website. */
  @Prop({ type: MongooseSchema.Types.Mixed, default: [] })
  companyPages: ScrapedPageRef[];

  /** Discovered competitors, with their scraped evidence. */
  @Prop({ type: MongooseSchema.Types.Mixed, default: [] })
  rivals: RivalData[];

  /** The full AI analysis (weaknesses, gaps, opportunities, …). */
  @Prop({ type: MongooseSchema.Types.Mixed, default: null })
  analysis: AuditAnalysis | null;

  /** The personalized email generated from this audit. */
  @Prop({ type: MongooseSchema.Types.Mixed, default: null })
  email: GeneratedEmailData | null;

  /** Step-by-step activity trace of the current run (capped). */
  @Prop({ type: MongooseSchema.Types.Mixed, default: [] })
  activity: AuditLogEntry[];

  @Prop({ type: String, default: null })
  error: string | null;

  @Prop({ type: Date, default: null })
  completedAt: Date | null;
}

export const LeadAuditSchema = SchemaFactory.createForClass(LeadAudit);
LeadAuditSchema.index({ campaignId: 1, status: 1 });
