import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AnalyzeRequest,
  AnalyzeResponse,
  BriefRequest,
  BriefResponse,
  ComposedEmail,
  LlmTestResponse,
  LlmWirePayload,
  WriteEmailRequest,
} from './ai.types';

/** Raised when the AI service cannot be reached or answers garbage. */
export class AiServiceError extends Error {}

const DEFAULT_TIMEOUT_MS = 60_000;

/**
 * Typed HTTP client for the AI (Google ADK) service. One retry on transport
 * errors; a hard timeout per call. Callers decide what a failure means — the
 * pipeline stages fall back to deterministic local builders so an AI outage
 * degrades quality, never availability.
 */
@Injectable()
export class AiClientService {
  private readonly logger = new Logger(AiClientService.name);
  private readonly baseUrl: string;

  constructor(config: ConfigService) {
    this.baseUrl = (
      config.get<string>('app.aiServiceUrl') ?? 'http://localhost:8000'
    ).replace(/\/$/, '');
  }

  /** Company profile + proposed rivals from ONE model call (cached per domain). */
  brief(req: BriefRequest): Promise<BriefResponse> {
    return this.post<BriefResponse>('/research/brief', req);
  }

  analyzeAudit(req: AnalyzeRequest): Promise<AnalyzeResponse> {
    return this.post<AnalyzeResponse>('/audit/analyze', req, 90_000);
  }

  writeEmail(req: WriteEmailRequest): Promise<ComposedEmail> {
    return this.post<ComposedEmail>('/email/write', req);
  }

  testLlm(llm: LlmWirePayload): Promise<LlmTestResponse> {
    return this.post<LlmTestResponse>('/llm/test', { llm }, 30_000);
  }

  private async post<T>(
    path: string,
    body: unknown,
    timeoutMs = DEFAULT_TIMEOUT_MS,
  ): Promise<T> {
    let lastError: unknown;
    for (let attempt = 0; attempt < 2; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const res = await fetch(`${this.baseUrl}${path}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: controller.signal,
        });
        if (!res.ok) {
          // 4xx is a contract bug, not a transient fault — don't retry.
          const text = await res.text().catch(() => '');
          const err = new AiServiceError(
            `AI service ${path} responded ${res.status}: ${text.slice(0, 300)}`,
          );
          if (res.status < 500) throw err;
          lastError = err;
          continue;
        }
        return (await res.json()) as T;
      } catch (err) {
        if (err instanceof AiServiceError && !lastError) throw err;
        lastError = err;
      } finally {
        clearTimeout(timer);
      }
    }
    const message =
      lastError instanceof Error ? lastError.message : String(lastError);
    this.logger.warn(`AI service ${path} unreachable: ${message}`);
    throw new AiServiceError(message);
  }
}
