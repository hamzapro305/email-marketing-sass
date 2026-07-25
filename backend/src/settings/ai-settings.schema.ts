import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type AiSettingsDocument = HydratedDocument<AiSettings>;

export type EmailTone =
  | 'professional'
  | 'friendly'
  | 'casual'
  | 'concise'
  | 'persuasive';

/**
 * Per-session AI email-writing configuration. The writer calls the Google ADK
 * sidecar (`ai-writer/`) and falls back to a built-in local writer whenever the
 * sidecar/LLM is unavailable, so it always works.
 */
@Schema({ timestamps: true, collection: 'ai_settings' })
export class AiSettings {
  @Prop({ required: true, unique: true, index: true })
  sessionId: string;

  // Google ADK / Gemini configuration.
  @Prop({ default: 'google-adk' })
  provider: string;

  @Prop({ default: 'gemini-2.0-flash' })
  model: string;

  /** Stored for the future live path; never returned in full (masked on read). */
  @Prop({ default: '' })
  apiKey: string;

  @Prop({ type: Number, default: 0.7, min: 0, max: 2 })
  temperature: number;

  // Sender identity used in the generated emails.
  @Prop({ default: '' })
  senderName: string;

  @Prop({ default: '' })
  senderCompany: string;

  @Prop({ default: '' })
  senderRole: string;

  // Writing instructions the agent follows.
  @Prop({
    type: String,
    enum: ['professional', 'friendly', 'casual', 'concise', 'persuasive'],
    default: 'professional',
  })
  tone: EmailTone;

  @Prop({ default: 'English' })
  language: string;

  @Prop({ type: Number, default: 120, min: 20, max: 500 })
  wordLimit: number;

  @Prop({ default: 'a quick 15-minute call' })
  callToAction: string;

  /** Free-form system prompt / guidelines for the email-writing agent. */
  @Prop({
    default:
      'Write a concise, personalized cold outreach email. Reference the ' +
      "recipient's company and role when relevant. Sound human, not salesy. " +
      'Open with a specific hook, give one clear value proposition, and end ' +
      'with a single low-friction call to action.',
  })
  instructions: string;
}

export const AiSettingsSchema = SchemaFactory.createForClass(AiSettings);
