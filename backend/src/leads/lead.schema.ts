import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type LeadDocument = HydratedDocument<Lead>;

export enum LeadStatus {
  Pending = 'pending',
  // Live sub-steps of a run, shown per lead in the UI:
  Queued = 'queued', // picked up, waiting for a worker
  Writing = 'writing', // the AI is composing this lead's email
  Sending = 'sending', // handing the composed email to the mail sender
  Sent = 'sent',
  Failed = 'failed',
}

@Schema({ timestamps: true, collection: 'leads' })
export class Lead {
  @Prop({ required: true, trim: true, lowercase: true, index: true })
  email: string;

  @Prop({ trim: true, default: '' })
  firstName: string;

  @Prop({ trim: true, default: '' })
  lastName: string;

  @Prop({ trim: true, default: '' })
  company: string;

  @Prop({ trim: true, default: '' })
  title: string;

  @Prop({
    type: String,
    enum: Object.values(LeadStatus),
    default: LeadStatus.Pending,
    index: true,
  })
  status: LeadStatus;

  @Prop({ type: String, default: null })
  errorMessage: string | null;

  @Prop({ type: Date, default: null })
  sentAt: Date | null;

  // The AI-written email that was sent to this lead (populated during a run).
  @Prop({ type: String, default: null })
  generatedSubject: string | null;

  @Prop({ type: String, default: null })
  generatedBody: string | null;

  @Prop({ type: Types.ObjectId, ref: 'Campaign', default: null, index: true })
  campaignId: Types.ObjectId | null;

  // The upload session this lead belongs to (a browser/app instance). Leads are
  // staged per session so a user can review and delete files before sending.
  @Prop({ type: String, default: null, index: true })
  sessionId: string | null;

  // The uploaded file this lead came from — deleting the file removes its leads.
  @Prop({ type: Types.ObjectId, ref: 'UploadFile', default: null, index: true })
  fileId: Types.ObjectId | null;
}

export const LeadSchema = SchemaFactory.createForClass(Lead);
