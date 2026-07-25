import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type CampaignDocument = HydratedDocument<Campaign>;

export enum CampaignStatus {
  Draft = 'draft',
  Running = 'running',
  Completed = 'completed',
  Failed = 'failed',
}

@Schema({ timestamps: true, collection: 'campaigns' })
export class Campaign {
  @Prop({ trim: true, default: '' })
  name: string;

  // No email subject is stored — the AI writer generates a subject per lead.
  @Prop({ trim: true, default: '' })
  description: string;

  @Prop({ type: String, default: null, index: true })
  sessionId: string | null;

  @Prop({
    type: String,
    enum: Object.values(CampaignStatus),
    default: CampaignStatus.Draft,
    index: true,
  })
  status: CampaignStatus;

  @Prop({ type: Number, default: 0 })
  totalLeads: number;

  @Prop({ type: Number, default: 0 })
  sentCount: number;

  @Prop({ type: Number, default: 0 })
  failedCount: number;

  @Prop({ type: Date, default: null })
  startedAt: Date | null;

  @Prop({ type: Date, default: null })
  completedAt: Date | null;
}

export const CampaignSchema = SchemaFactory.createForClass(Campaign);
