import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  CompanyProfile,
  CompanyProfileDocument,
} from '../../audits/company-profile.schema';
import {
  CompanyProfileData,
  RivalData,
  ScrapedPageRef,
} from '../../audits/audit.types';
import { extractDomain, normalizeWebsite } from '../../leads/lead-parser';
import { ScraperService } from '../../scraper/scraper.service';
import { PageContent, WebsiteSignals } from '../../scraper/scraper.types';
import { AiClientService } from '../../ai/ai-client.service';
import { LocalFallbacksService } from '../../ai/local-fallbacks.service';
import { LlmWirePayload } from '../../ai/ai.types';
import { RedisCoordinationService } from '../../redis/redis-coordination.service';

export interface CompanyResearchResult {
  profile: CompanyProfileData;
  signals: WebsiteSignals | null;
  pages: ScrapedPageRef[];
  /** Validated (but not yet scraped) rivals from the same brief call. */
  rivals: RivalData[];
}

const LOCK_TTL_MS = 180_000;
const CACHE_POLL_MS = 2_000;
const CACHE_WAIT_MAX_MS = 90_000;

export const pageToRef = (page: PageContent): ScrapedPageRef => ({
  url: page.url,
  title: page.title,
  description: page.description,
  wordCount: page.wordCount,
  excerpt: page.text.slice(0, 1_200),
  fetchedAt: page.fetchedAt,
});

/**
 * Company research, deduplicated at the domain level and optimized for LLM
 * spend: ONE combined "brief" model call returns both the company profile and
 * its proposed rivals, and the result is cached per domain — the first lead
 * from a company pays for it, every other lead (on any worker) reuses it.
 *
 * A cached result produced without an LLM (`engine: fallback`) is treated as
 * stale the moment the session has an LLM configured, so adding an API key in
 * Settings upgrades future audits immediately instead of waiting out the TTL.
 */
@Injectable()
export class CompanyResearchService {
  private readonly logger = new Logger(CompanyResearchService.name);
  private readonly ttlHours: number;
  private readonly maxRivals: number;

  constructor(
    @InjectModel(CompanyProfile.name)
    private readonly profileModel: Model<CompanyProfileDocument>,
    private readonly scraper: ScraperService,
    private readonly ai: AiClientService,
    private readonly fallbacks: LocalFallbacksService,
    private readonly coordination: RedisCoordinationService,
    config: ConfigService,
  ) {
    this.ttlHours = config.get<number>('app.researchCacheTtlHours') ?? 168;
    this.maxRivals = config.get<number>('app.maxRivals') ?? 3;
  }

  async getOrBuild(input: {
    domain: string;
    website: string;
    companyName: string;
    industry: string;
    location: string;
    llm?: LlmWirePayload;
  }): Promise<CompanyResearchResult> {
    const hasLlm = Boolean(input.llm);
    const cached = await this.readFreshCache(input.domain, hasLlm);
    if (cached) return cached;

    const lockName = `research:${input.domain}`;
    const token = await this.coordination.acquireLock(lockName, LOCK_TTL_MS);
    if (!token) {
      // Another worker is researching this domain right now — wait for its
      // result instead of duplicating the scrape + AI spend.
      const waited = await this.waitForCache(input.domain, hasLlm);
      if (waited) return waited;
      // The other worker died or is too slow; build it ourselves.
    }

    try {
      // Re-check after winning the lock (the previous holder may have finished).
      const recheck = await this.readFreshCache(input.domain, hasLlm);
      if (recheck) return recheck;
      return await this.build(input);
    } finally {
      if (token) await this.coordination.releaseLock(lockName, token);
    }
  }

  private async build(input: {
    domain: string;
    website: string;
    companyName: string;
    industry: string;
    location: string;
    llm?: LlmWirePayload;
  }): Promise<CompanyResearchResult> {
    const site = await this.scraper.scrapeSite(input.website, input.domain);
    const signals = site.pages.length > 0 ? site.signals : null;
    const pageRefs = site.pages.map(pageToRef);

    let profile: CompanyProfileData;
    let rivals: RivalData[] = [];
    try {
      const res = await this.ai.brief({
        company: {
          name: input.companyName,
          domain: input.domain,
          website: input.website,
        },
        industry: input.industry,
        location: input.location,
        pages: site.pages.map((p) => ({
          url: p.url,
          title: p.title,
          description: p.description,
          text: p.text.slice(0, 4_000),
        })),
        signals,
        maxRivals: this.maxRivals,
        llm: input.llm,
      });
      profile = {
        ...res.profile,
        name: res.profile.name || input.companyName || input.domain,
        domain: input.domain,
        website: input.website,
        engine: res.engine,
      };
      rivals = this.validateRivals(input.domain, res.rivals ?? []);
    } catch {
      profile = this.fallbacks.profileFromPages(
        input.companyName,
        input.domain,
        input.website,
        site.pages,
      );
      rivals = []; // AI unreachable → no invented competitors
    }

    await this.profileModel
      .findOneAndUpdate(
        { domain: input.domain },
        {
          $set: {
            website: input.website,
            profile,
            signals,
            pages: pageRefs,
            rivals,
            // A rebuild invalidates the cached analysis too — it was derived
            // from the previous research.
            analysis: null,
            expiresAt: new Date(Date.now() + this.ttlHours * 3_600_000),
          },
        },
        { upsert: true },
      )
      .exec();

    this.logger.log(
      `Researched ${input.domain}: ${site.pages.length} pages, ` +
        `${rivals.length} rivals, engine=${profile.engine}.`,
    );
    return { profile, signals, pages: pageRefs, rivals };
  }

  /** Drop self-references, invalid/duplicate domains; cap the list. */
  private validateRivals(
    ownDomain: string,
    proposed: Array<{ name: string; website: string; reason: string }>,
  ): RivalData[] {
    const seen = new Set<string>([ownDomain]);
    const out: RivalData[] = [];
    for (const p of proposed) {
      const website = normalizeWebsite(p.website ?? '');
      const domain = extractDomain(website);
      const name = (p.name ?? '').trim();
      if (!name || !domain || seen.has(domain)) continue;
      seen.add(domain);
      out.push({
        name,
        website,
        domain,
        reason: (p.reason ?? '').trim(),
        summary: '',
        signals: null,
        pages: [],
      });
      if (out.length >= this.maxRivals) break;
    }
    return out;
  }

  /**
   * A cache entry is usable when it hasn't expired AND it isn't a fallback
   * result that an now-configured LLM could improve on.
   */
  private async readFreshCache(
    domain: string,
    llmConfigured: boolean,
  ): Promise<CompanyResearchResult | null> {
    const doc = await this.profileModel.findOne({ domain }).lean().exec();
    if (!doc?.profile || new Date(doc.expiresAt) <= new Date()) return null;
    if (llmConfigured && doc.profile.engine === 'fallback') return null;
    return {
      profile: doc.profile,
      signals: doc.signals,
      pages: doc.pages ?? [],
      rivals: doc.rivals ?? [],
    };
  }

  private async waitForCache(
    domain: string,
    llmConfigured: boolean,
  ): Promise<CompanyResearchResult | null> {
    const deadline = Date.now() + CACHE_WAIT_MAX_MS;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, CACHE_POLL_MS));
      const cached = await this.readFreshCache(domain, llmConfigured);
      if (cached) return cached;
    }
    return null;
  }
}
