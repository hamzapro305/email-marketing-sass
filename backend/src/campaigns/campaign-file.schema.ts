import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type CampaignFileDocument = HydratedDocument<CampaignFile>;

/**
 * One uploaded CSV/XLSX that added leads to a campaign. Leads reference it via
 * `fileId` so a user can delete a file (and its not-yet-sent leads) before
 * sending.
 */
@Schema({ timestamps: true, collection: 'campaign_files' })
export class CampaignFile {
  @Prop({ type: Types.ObjectId, ref: 'Campaign', required: true, index: true })
  campaignId: Types.ObjectId;

  @Prop({ required: true, index: true })
  sessionId: string;

  @Prop({ required: true, trim: true })
  originalName: string;

  @Prop({ type: Number, default: 0 })
  size: number;

  @Prop({ type: Number, default: 0 })
  leadCount: number;

  @Prop({ type: Number, default: 0 })
  skipped: number;
}

export const CampaignFileSchema = SchemaFactory.createForClass(CampaignFile);
