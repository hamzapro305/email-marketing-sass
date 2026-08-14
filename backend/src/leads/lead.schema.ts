import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type LeadDocument = HydratedDocument<Lead>;

export enum LeadStatus {
  Pending = 'pending',
  // Live steps of the audit + send pipeline, shown per lead in the UI:
  Queued = 'queued', // enqueued, waiting for a worker
  Researching = 'researching', // company research, rival discovery, scraping
  Analyzing = 'analyzing', // AI analysis of the collected research
  Writing = 'writing', // the AI is composing this lead's email
  Ready = 'ready', // audit + email complete (audit-only run, nothing sent)
  Sending = 'sending', // handing the composed email to the mail sender
  Sent = 'sent',
  Failed = 'failed',
}

/** Statuses that mean "a worker is actively moving this lead". */
export const ACTIVE_LEAD_STATUSES: LeadStatus[] = [
  LeadStatus.Queued,
  LeadStatus.Researching,
  LeadStatus.Analyzing,
  LeadStatus.Writing,
  LeadStatus.Sending,
];

@Schema({ timestamps: true, collection: 'leads' })
export class Lead {
  @Prop({ required: true, trim: true, lowercase: true })
  email: string;

  @Prop({ trim: true, default: '' })
  firstName: string;

  @Prop({ trim: true, default: '' })
  lastName: string;

  @Prop({ trim: true, default: '' })
  company: string;

  @Prop({ trim: true, default: '' })
  title: string;

  // ── Optional enrichment columns recognized on import ─────────
  @Prop({ trim: true, default: '' })
  website: string;

  @Prop({ trim: true, default: '' })
  phone: string;

  @Prop({ trim: true, default: '' })
  industry: string;

  @Prop({ trim: true, default: '' })
  location: string;

  @Prop({ trim: true, default: '' })
  linkedinUrl: string;

  /**
   * The company's web domain, derived on import from the website column or the
   * lead's business email domain (free-mail providers excluded). This is the
   * research cache key — leads sharing a domain share company research.
   */
  @Prop({ trim: true, lowercase: true, default: '', index: true })
  companyDomain: string;

  @Prop({
    type: String,
    enum: Object.values(LeadStatus),
    default: LeadStatus.Pending,
  })
  status: LeadStatus;

  @Prop({ type: String, default: null })
  errorMessage: string | null;

  @Prop({ type: Date, default: null })
  sentAt: Date | null;

  // The AI-written email for this lead (populated by the pipeline's email
  // stage; what actually gets sent).
  @Prop({ type: String, default: null })
  generatedSubject: string | null;

  @Prop({ type: String, default: null })
  generatedBody: string | null;

  @Prop({ type: Types.ObjectId, ref: 'Campaign', default: null })
  campaignId: Types.ObjectId | null;

  // The upload session this lead belongs to (a browser/app instance). Leads are
  // staged per session so a user can review and delete files before sending.
  @Prop({ type: String, default: null })
  sessionId: string | null;

  // The uploaded file this lead came from — deleting the file removes its leads.
  @Prop({ type: Types.ObjectId, ref: 'UploadFile', default: null })
  fileId: Types.ObjectId | null;
}

export const LeadSchema = SchemaFactory.createForClass(Lead);

// One row per email per campaign — duplicate rows in a CSV (or a re-uploaded
// file) are silently dropped by insertMany({ordered:false}) hitting this index.
LeadSchema.index(
  { campaignId: 1, email: 1 },
  { unique: true, partialFilterExpression: { campaignId: { $type: 'objectId' } } },
);
// The hot list queries: session views sorted by activity, campaign board
// filtered by status, per-file pending counts.
LeadSchema.index({ sessionId: 1, updatedAt: -1 });
LeadSchema.index({ campaignId: 1, status: 1 });
LeadSchema.index({ fileId: 1, status: 1 });
