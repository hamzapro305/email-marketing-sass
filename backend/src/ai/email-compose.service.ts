import { Injectable, Logger } from '@nestjs/common';
import {
  formatUsage,
  ComposedEmail,
  EmailAuditContext,
  LlmWirePayload,
  WriterLead,
} from './ai.types';
import { AiClientService } from './ai-client.service';
import { FallbackEmailWriterService } from './fallback-email-writer.service';
import { cleanEmail } from './email-text';
import { LeadAudit } from '../audits/lead-audit.schema';
import { AiSettingsData } from '../settings/settings.service';
import { StageLogger, noopStageLogger } from '../audits/audit.types';

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
    log?: StageLogger;
  }): Promise<ComposedEmail> {
    const log = input.log ?? noopStageLogger;
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

    const ctx = request.audit;
    const cited = ctx
      ? ctx.weaknesses.length + ctx.opportunities.length + ctx.recommendations.length + ctx.insights.length
      : 0;
    const briefing = ctx
      ? `Findings handed to the writer: ${ctx.weaknesses.length} weaknesses, ` +
        `${ctx.opportunities.length} opportunities, ${ctx.recommendations.length} recommendations, ` +
        `${ctx.insights.length} insights, ${ctx.rivalNames.length} competitor name${ctx.rivalNames.length === 1 ? '' : 's'}` +
        `\nTone: ${settings.tone} · Language: ${settings.language} · Limit: ${settings.wordLimit} words`
      : 'No audit findings available — the email can only use the lead fields.';
    if (input.llm) {
      log('info', `Asking ${input.llm.provider} to write the email`, briefing);
    } else {
      log('warn', 'No AI provider configured — the template writer will be used', briefing);
    }
    if (ctx && cited === 0) {
      log('warn', 'The audit produced no findings, so the email cannot cite anything specific.');
    }

    try {
      const email = await this.ai.writeEmail(request);
      if (!email?.subject || !email?.body) {
        throw new Error('AI service returned an incomplete email');
      }
      const cost = formatUsage(email.usage);
      if (email.engine === 'fallback') {
        log(
          'warn',
          'AI writer unavailable — template email generated',
          [email.error, cost && `Spent: ${cost}`].filter(Boolean).join('\n') || undefined,
        );
      } else {
        log(
          'success',
          `${email.engine} wrote the email`,
          `Subject: ${email.subject}` + (cost ? `\nCost: ${cost}` : ''),
        );
      }
      // Usage is trace-only; keep it out of the stored email document.
      const { usage: _usage, ...stored } = email;
      return cleanEmail(stored);
    } catch (err) {
      this.logger.warn(
        `AI email writer failed for ${input.lead.email} — using local writer: ${
          err instanceof Error ? err.message : err
        }`,
      );
      log(
        'warn',
        'AI service unreachable — template email generated locally',
        err instanceof Error ? err.message : String(err),
      );
      return cleanEmail(this.fallbackWriter.write(request));
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
