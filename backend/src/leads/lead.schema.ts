import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type LeadDocument = HydratedDocument<Lead>;

export enum LeadStatus {
  Pending = 'pending',
  Sending = 'sending',
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

  @Prop({ type: Types.ObjectId, ref: 'Campaign', default: null, index: true })
  campaignId: Types.ObjectId | null;
}

export const LeadSchema = SchemaFactory.createForClass(Lead);
