import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type SuppressionDocument = HydratedDocument<Suppression>;

/**
 * Addresses that must never be emailed again (unsubscribed recipients).
 * Checked at send time — a suppressed lead is skipped, not sent.
 */
@Schema({ timestamps: true, collection: 'suppressions' })
export class Suppression {
  @Prop({ required: true, index: true })
  sessionId: string;

  @Prop({ required: true, trim: true, lowercase: true })
  email: string;

  @Prop({ default: 'unsubscribed' })
  reason: string;
}

export const SuppressionSchema = SchemaFactory.createForClass(Suppression);
SuppressionSchema.index({ sessionId: 1, email: 1 }, { unique: true });
