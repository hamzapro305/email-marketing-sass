import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type LlmAccountDocument = HydratedDocument<LlmAccount>;

export type LlmProvider = 'gemini' | 'openai' | 'ollama';
export const LLM_PROVIDERS: LlmProvider[] = ['gemini', 'openai', 'ollama'];

/**
 * A user-managed LLM configuration, scoped to an upload session. Mirrors how
 * SMTP accounts work: a session can have several, exactly one is the default
 * used to write emails. The API key is stored server-side and never returned in
 * full (masked on read). Ollama needs no key — a base URL instead.
 */
@Schema({ timestamps: true, collection: 'llm_accounts' })
export class LlmAccount {
  @Prop({ required: true, index: true })
  sessionId: string;

  /** Friendly name shown in the UI, e.g. "Gemini Flash". */
  @Prop({ required: true, trim: true })
  label: string;

  @Prop({ type: String, enum: LLM_PROVIDERS, required: true })
  provider: LlmProvider;

  /** Model id, e.g. gemini-2.0-flash / gpt-4o-mini / llama3.2:3b. */
  @Prop({ required: true, trim: true })
  model: string;

  /** API key for gemini/openai. Masked on read, never returned in full. */
  @Prop({ default: '' })
  apiKey: string;

  /** Base URL for Ollama (ignored for gemini/openai). */
  @Prop({ trim: true, default: '' })
  apiBase: string;

  @Prop({ type: Number, default: 0.7, min: 0, max: 2 })
  temperature: number;

  /** Exactly one account per session is the default writer. */
  @Prop({ type: Boolean, default: false, index: true })
  isDefault: boolean;
}

export const LlmAccountSchema = SchemaFactory.createForClass(LlmAccount);
