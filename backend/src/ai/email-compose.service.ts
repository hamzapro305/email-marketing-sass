import { Injectable, Logger } from '@nestjs/common';
import {
  ComposedEmail,
  EmailAuditContext,
  LlmWirePayload,
  WriterLead,
} from './ai.types';
import { AiClientService } from './ai-client.service';
import { FallbackEmailWriterService } from './fallback-email-writer.service';
import { LeadAudit } from '../audits/lead-audit.schema';
import { AiSettingsData } from '../settings/settings.service';

/**
 * Composes the personalized outreach email from a finished audit (or, for the
 * Settings preview, from no audit at all). The AI writer receives the distilled
 * findings — real weaknesses, opportunities, rival names, recommendations — so
 * the email cites actual research; the local fallback writer uses the same
 * findings, so even a degraded email is grounded rather than generic.
 */
@Injectable()
export class EmailComposeService {
  private readonly logger = new Logger(EmailComposeService.name);

  constructor(
    private readonly ai: AiClientService,
    private readonly fallbackWriter: FallbackEmailWriterService,
  ) {}

  async compose(input: {
    lead: WriterLead;
    campaign: { name: string; description?: string };
    settings: AiSettingsData;
    audit: LeadAudit | null;
    llm?: LlmWirePayload;
  }): Promise<ComposedEmail> {
    // Strip the legacy stored key — LLM credentials travel only via `llm`.
    const { apiKey: _apiKey, ...settings } = input.settings as AiSettingsData & {
      apiKey?: string;
    };

    const request = {
      lead: input.lead,
      campaign: input.campaign,
      settings: settings as AiSettingsData,
      audit: this.distill(input.audit),
      llm: input.llm,
    };

    try {
      const email = await this.ai.writeEmail(request);
      if (!email?.subject || !email?.body) {
        throw new Error('AI service returned an incomplete email');
      }
      return email;
    } catch (err) {
      this.logger.warn(
        `AI email writer failed for ${input.lead.email} — using local writer: ${
          err instanceof Error ? err.message : err
        }`,
      );
      return this.fallbackWriter.write(request);
    }
  }

  /** The audit reduced to what the writer can actually cite. */
  private distill(audit: LeadAudit | null): EmailAuditContext | null {
    if (!audit || (!audit.analysis && !audit.company)) return null;
    const analysis = audit.analysis;
    return {
      companySummary: audit.company?.summary ?? '',
      signals: audit.companySignals,
      weaknesses: (analysis?.weaknesses ?? []).slice(0, 3),
      opportunities: (analysis?.opportunities ?? []).slice(0, 3),
      rivalNames: (audit.rivals ?? []).map((r) => r.name).slice(0, 3),
      recommendations: (analysis?.recommendations ?? []).slice(0, 3),
      insights: (analysis?.insights ?? []).slice(0, 3),
    };
  }
}
