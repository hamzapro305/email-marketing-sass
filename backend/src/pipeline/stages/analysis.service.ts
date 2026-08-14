import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  CompanyProfile,
  CompanyProfileDocument,
} from '../../audits/company-profile.schema';
import { AuditAnalysis } from '../../audits/audit.types';
import { LeadAuditDocument } from '../../audits/lead-audit.schema';
import { LeadDocument } from '../../leads/lead.schema';
import { AiClientService } from '../../ai/ai-client.service';
import { LocalFallbacksService } from '../../ai/local-fallbacks.service';
import { LlmWirePayload } from '../../ai/ai.types';

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
  ): Promise<AuditAnalysis> {
    const domain = lead.companyDomain;

    if (domain) {
      const cached = await this.readCachedAnalysis(domain, Boolean(llm));
      if (cached) return cached;
    }

    const analysis = await this.compute(lead, audit, llm);

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
    llm?: LlmWirePayload,
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
      return { ...res.analysis, engine: res.engine };
    } catch (err) {
      this.logger.warn(
        `AI analysis failed for ${company.domain || lead._id} — using heuristics: ${
          err instanceof Error ? err.message : err
        }`,
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
