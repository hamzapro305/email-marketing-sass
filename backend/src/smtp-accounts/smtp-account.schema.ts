import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type SmtpAccountDocument = HydratedDocument<SmtpAccount>;

/**
 * A user-managed SMTP sending account, scoped to an upload session. A session
 * can have several; exactly one is the default used to send campaigns. The
 * password is stored server-side and never returned in full (masked on read),
 * mirroring how the AI provider key is handled.
 */
@Schema({ timestamps: true, collection: 'smtp_accounts' })
export class SmtpAccount {
  @Prop({ required: true, index: true })
  sessionId: string;

  /** Friendly name shown in the UI, e.g. "Primary Gmail". */
  @Prop({ required: true, trim: true })
  label: string;

  @Prop({ required: true, trim: true })
  host: string;

  @Prop({ type: Number, required: true, default: 587 })
  port: number;

  /** true → implicit TLS (port 465); false → STARTTLS (port 587). */
  @Prop({ type: Boolean, default: false })
  secure: boolean;

  @Prop({ required: true, trim: true })
  user: string;

  /** SMTP password / app password. Masked on read, never returned in full. */
  @Prop({ default: '' })
  pass: string;

  /** Display name on the From header. */
  @Prop({ trim: true, default: '' })
  fromName: string;

  /** From email address; falls back to `user` when blank. */
  @Prop({ trim: true, default: '' })
  fromEmail: string;

  /** Exactly one account per session is the default sender. */
  @Prop({ type: Boolean, default: false, index: true })
  isDefault: boolean;
}

export const SmtpAccountSchema = SchemaFactory.createForClass(SmtpAccount);
