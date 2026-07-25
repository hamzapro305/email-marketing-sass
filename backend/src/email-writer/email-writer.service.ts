import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ComposedEmail, WriteInput } from './email-writer.interface';
import { DemoEmailWriter } from './demo-email-writer';
import { LlmAccountsService } from '../llm-accounts/llm-accounts.service';

const REQUEST_TIMEOUT_MS = 30_000;

/**
 * Writes each lead's email via the Google ADK sidecar (`ai-writer/`) over HTTP.
 * On any failure — the sidecar being unreachable, a bad LLM key, a timeout — it
 * transparently falls back to the local {@link DemoEmailWriter} so a send is
 * never blocked and the app works out of the box without the sidecar running.
 */
@Injectable()
export class EmailWriterService {
  private readonly logger = new Logger(EmailWriterService.name);
  private readonly aiWriterUrl: string;

  constructor(
    private readonly demo: DemoEmailWriter,
    private readonly llmAccounts: LlmAccountsService,
    config: ConfigService,
  ) {
    this.aiWriterUrl = (
      config.get<string>('app.aiWriterUrl') ?? 'http://localhost:8000'
    ).replace(/\/$/, '');
  }

  async compose(input: WriteInput): Promise<ComposedEmail> {
    return this.composeWithAdk(input);
  }

  /**
   * Calls the Google ADK sidecar (`ai-writer/`), which runs an ADK LlmAgent
   * against the configured provider (Gemini/OpenAI/Ollama, or its own local
   * fallback if no key is set). On any failure we fall back to the local writer
   * so a send is never blocked.
   */
  private async composeWithAdk(input: WriteInput): Promise<ComposedEmail> {
    // Resolve the session's chosen LLM (provider/model/key). When none is
    // configured we send no `llm` and the sidecar uses its own env/fallback.
    const llm = await this.llmAccounts.getDefaultConfig(input.sessionId);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const res = await fetch(`${this.aiWriterUrl}/write`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lead: input.lead,
          campaign: input.campaign,
          settings: input.settings,
          llm: llm ? this.llmAccounts.toWirePayload(llm) : undefined,
        }),
        signal: controller.signal,
      });
      if (!res.ok) {
        throw new Error(`ai-writer responded ${res.status}`);
      }
      const data = (await res.json()) as ComposedEmail & { engine?: string };
      if (!data?.subject || !data?.body) {
        throw new Error('ai-writer returned an incomplete email');
      }
      return { subject: data.subject, body: data.body };
    } catch (err) {
      this.logger.warn(
        `Live AI writer (${this.aiWriterUrl}) failed — using demo writer: ` +
          `${err instanceof Error ? err.message : err}`,
      );
      return this.demo.write(input);
    } finally {
      clearTimeout(timer);
    }
  }
}
