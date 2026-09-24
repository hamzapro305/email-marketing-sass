import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  CompanyProfile,
  CompanyProfileDocument,
} from '../../audits/company-profile.schema';
import {
  AuditAnalysis,
  StageLogger,
  noopStageLogger,
} from '../../audits/audit.types';
import { LeadAuditDocument } from '../../audits/lead-audit.schema';
import { LeadDocument } from '../../leads/lead.schema';
import { AiClientService } from '../../ai/ai-client.service';
import { LocalFallbacksService } from '../../ai/local-fallbacks.service';
import { LlmWirePayload, formatUsage } from '../../ai/ai.types';

/**
 * Turns the collected research (company profile, signals, rival evidence)
 * into the structured analysis section of the audit.
 *
 * The analysis is company-scoped by design — nothing lead-specific enters the
 * prompt — so it is cached per company domain: 500 leads at acme.com pay for
 * ONE analysis model call. Per-lead personalization happens in the email
 * stage instead. Cached fallback analyses (produced without an LLM) are
 * recomputed as soon as an LLM is configured.
 */
@Injectable()
export class AnalysisService {
  private readonly logger = new Logger(AnalysisService.name);
  private readonly ttlHours: number;

  constructor(
    @InjectModel(CompanyProfile.name)
    private readonly profileModel: Model<CompanyProfileDocument>,
    private readonly ai: AiClientService,
    private readonly fallbacks: LocalFallbacksService,
    config: ConfigService,
  ) {
    this.ttlHours = config.get<number>('app.researchCacheTtlHours') ?? 168;
  }

  async analyze(
    lead: LeadDocument,
    audit: LeadAuditDocument,
    llm?: LlmWirePayload,
    log: StageLogger = noopStageLogger,
  ): Promise<AuditAnalysis> {
    const domain = lead.companyDomain;

    if (domain) {
      const cached = await this.readCachedAnalysis(domain, Boolean(llm));
      if (cached) {
        log('success', 'Reused the cached analysis for this company', summarize(cached));
        return cached;
      }
      log('info', 'No fresh cached analysis — computing one');
    } else {
      log('warn', 'No company domain — analysis cannot be cached or grounded in a website');
    }

    const analysis = await this.compute(lead, audit, llm, log);

    if (domain) {
      await this.profileModel
        .updateOne({ domain }, { $set: { analysis } })
        .exec()
        .catch(() => undefined);
    }
    return analysis;
  }

  private async compute(
    lead: LeadDocument,
    audit: LeadAuditDocument,
    llm: LlmWirePayload | undefined,
    log: StageLogger,
  ): Promise<AuditAnalysis> {
    const company = audit.company ?? {
      name: lead.company || lead.companyDomain || 'Unknown company',
      domain: lead.companyDomain,
      website: lead.website,
      summary: '',
      products: [],
      services: [],
      targetCustomers: '',
      positioning: '',
      engine: 'none',
    };

    const pageCount = (audit.companyPages ?? []).length;
    const rivalCount = (audit.rivals ?? []).length;
    const rivalPages = (audit.rivals ?? []).reduce((n, r) => n + r.pages.length, 0);
    const evidence =
      `Company pages: ${Math.min(pageCount, 3)} of ${pageCount} excerpted · ` +
      `Signals: ${audit.companySignals ? 'yes' : 'none'} · ` +
      `Competitors: ${rivalCount} (${rivalPages} scraped page${rivalPages === 1 ? '' : 's'})`;
    if (llm) {
      log('info', `Asking ${llm.provider} to analyze the evidence`, evidence);
    } else {
      log('warn', 'No AI provider configured — the analysis will be heuristic (signals only)', evidence);
    }
    if (pageCount === 0 && rivalCount === 0) {
      log('warn', 'There is no evidence to analyze: no pages were read and no competitors were found. Expect an empty audit.');
    }

    try {
      const res = await this.ai.analyzeAudit({
        company: {
          profile: company,
          industry: lead.industry,
          location: lead.location,
          signals: audit.companySignals,
          excerpts: (audit.companyPages ?? [])
            .slice(0, 3)
            .map((p) => `${p.title ? `${p.title}: ` : ''}${p.excerpt}`),
        },
        rivals: (audit.rivals ?? []).map((r) => ({
          name: r.name,
          website: r.website,
          summary: r.summary,
          signals: r.signals,
          excerpts: r.pages.slice(0, 2).map((p) => p.excerpt.slice(0, 800)),
        })),
        llm,
      });
      const analysis = { ...res.analysis, engine: res.engine };
      const cost = formatUsage(res.usage);
      if (res.engine === 'fallback') {
        log(
          'warn',
          'AI analysis unavailable — heuristic analysis used',
          [res.error, cost && `Spent: ${cost}`].filter(Boolean).join('\n') || undefined,
        );
      } else {
        log(
          'success',
          `${res.engine} returned the analysis`,
          summarize(analysis) + (cost ? `\nCost: ${cost}` : ''),
        );
      }
      return analysis;
    } catch (err) {
      this.logger.warn(
        `AI analysis failed for ${company.domain || lead._id} — using heuristics: ${
          err instanceof Error ? err.message : err
        }`,
      );
      log(
        'warn',
        'AI service unreachable — heuristic analysis from website signals used',
        err instanceof Error ? err.message : String(err),
      );
      return this.fallbacks.analysisFromSignals(
        company,
        audit.companySignals,
        audit.rivals ?? [],
      );
    }
  }

  /** Fresh cached analysis, unless it's a fallback an LLM could now improve. */
  private async readCachedAnalysis(
    domain: string,
    llmConfigured: boolean,
  ): Promise<AuditAnalysis | null> {
    const doc = await this.profileModel
      .findOne({ domain })
      .select('analysis expiresAt')
      .lean()
      .exec();
    if (!doc?.analysis || new Date(doc.expiresAt) <= new Date()) return null;
    if (llmConfigured && doc.analysis.engine === 'fallback') return null;
    return doc.analysis;
  }
}

const summarize = (a: AuditAnalysis): string =>
  `Engine: ${a.engine} · ${a.weaknesses.length} weaknesses · ${a.gaps.length} gaps · ` +
  `${a.opportunities.length} opportunities · ${a.comparisons.length} comparisons · ` +
  `${a.recommendations.length} recommendations` +
  (a.summary ? `\n${a.summary}` : '');
