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
  StageLogger,
  noopStageLogger,
} from '../../audits/audit.types';
import { extractDomain, normalizeWebsite } from '../../leads/lead-parser';
import { ScraperService } from '../../scraper/scraper.service';
import { PageContent, WebsiteSignals } from '../../scraper/scraper.types';
import { AiClientService } from '../../ai/ai-client.service';
import { LocalFallbacksService } from '../../ai/local-fallbacks.service';
import { LlmWirePayload, formatUsage } from '../../ai/ai.types';
import { RedisCoordinationService } from '../../redis/redis-coordination.service';

export interface CompanyResearchResult {
  profile: CompanyProfileData;
  signals: WebsiteSignals | null;
  pages: ScrapedPageRef[];
  /** Validated (but not yet scraped) rivals from the same brief call. */
  rivals: RivalData[];
}

interface ResearchInput {
  domain: string;
  website: string;
  companyName: string;
  industry: string;
  location: string;
  llm?: LlmWirePayload;
  log?: StageLogger;
}

const LOCK_TTL_MS = 180_000;
const CACHE_POLL_MS = 2_000;
const CACHE_WAIT_MAX_MS = 90_000;

const describeResult = (r: CompanyResearchResult): string =>
  `Engine: ${r.profile.engine} · ${r.pages.length} page${r.pages.length === 1 ? '' : 's'} · ` +
  `${r.rivals.length} competitor${r.rivals.length === 1 ? '' : 's'}` +
  (r.rivals.length ? `: ${r.rivals.map((x) => x.name).join(', ')}` : '');

export const describeSignals = (s: WebsiteSignals): string =>
  [
    `Pricing page: ${s.hasPricingPage ? 'yes' : 'no'}`,
    `Blog: ${s.hasBlog ? 'yes' : 'no'}`,
    `Contact page: ${s.hasContactPage ? 'yes' : 'no'}`,
    `Careers page: ${s.hasCareersPage ? 'yes' : 'no'}`,
    `Meta description: ${s.missingMetaDescription ? 'missing' : 'present'}`,
    `Homepage words: ${s.homepageWordCount}`,
    `Social links: ${s.socialLinks.length ? s.socialLinks.join(', ') : 'none'}`,
    `Tech: ${s.techHints.length ? s.techHints.join(', ') : 'none detected'}`,
  ].join('\n');

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

  async getOrBuild(input: ResearchInput): Promise<CompanyResearchResult> {
    const log = input.log ?? noopStageLogger;
    const hasLlm = Boolean(input.llm);
    log(
      'info',
      `Looking up ${input.domain} in the research cache`,
      hasLlm
        ? `AI provider: ${input.llm!.provider}${input.llm!.model ? ` / ${input.llm!.model}` : ''}`
        : 'No AI provider configured — a cached heuristic result is acceptable',
    );
    const cached = await this.readFreshCache(input.domain, hasLlm);
    if (cached) {
      log('success', 'Reused cached research for this company', describeResult(cached));
      return cached;
    }
    log('info', 'No fresh cache entry — researching from scratch');

    const lockName = `research:${input.domain}`;
    const token = await this.coordination.acquireLock(lockName, LOCK_TTL_MS);
    if (!token) {
      // Another worker is researching this domain right now — wait for its
      // result instead of duplicating the scrape + AI spend.
      log('info', 'Another worker is already researching this company — waiting for its result');
      const waited = await this.waitForCache(input.domain, hasLlm);
      if (waited) {
        log('success', 'Received research from the other worker', describeResult(waited));
        return waited;
      }
      log('warn', 'The other worker did not finish in time — researching here instead');
      // The other worker died or is too slow; build it ourselves.
    }

    try {
      // Re-check after winning the lock (the previous holder may have finished).
      const recheck = await this.readFreshCache(input.domain, hasLlm);
      if (recheck) {
        log('success', 'Research finished elsewhere meanwhile — reusing it', describeResult(recheck));
        return recheck;
      }
      return await this.build(input, log);
    } finally {
      if (token) await this.coordination.releaseLock(lockName, token);
    }
  }

  private async build(
    input: ResearchInput,
    log: StageLogger,
  ): Promise<CompanyResearchResult> {
    log('info', `Scraping ${input.website}`);
    const site = await this.scraper.scrapeSite(input.website, input.domain, log);
    const signals = site.pages.length > 0 ? site.signals : null;
    const pageRefs = site.pages.map(pageToRef);
    if (signals) {
      log('info', `Computed website signals from ${site.pages.length} page${site.pages.length === 1 ? '' : 's'}`, describeSignals(signals));
    } else {
      log('warn', 'No pages could be read — no website signals available');
    }

    let profile: CompanyProfileData;
    let rivals: RivalData[] = [];
    try {
      if (input.llm) {
        log(
          'info',
          `Asking ${input.llm.provider} for a company brief (profile + up to ${this.maxRivals} competitors)`,
          `Context sent: ${site.pages.length} page${site.pages.length === 1 ? '' : 's'}` +
            (input.industry ? `, industry "${input.industry}"` : '') +
            (input.location ? `, location "${input.location}"` : ''),
        );
      } else {
        log('warn', 'No AI provider configured — building a heuristic profile from the scraped pages instead');
      }
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
      const proposed = res.rivals ?? [];
      rivals = this.validateRivals(input.domain, proposed);
      if (res.engine === 'fallback') {
        log(
          'warn',
          'AI brief unavailable — using a heuristic profile; no competitors were proposed',
          [res.error, formatUsage(res.usage) && `Spent: ${formatUsage(res.usage)}`]
            .filter(Boolean)
            .join('\n') || undefined,
        );
      } else {
        log(
          'success',
          `${res.engine} returned the company brief`,
          `Summary: ${profile.summary || '(empty)'}\n` +
            `Products: ${profile.products.length} · Services: ${profile.services.length}` +
            (res.usage ? `\nCost: ${formatUsage(res.usage)}` : ''),
        );
        log(
          rivals.length ? 'success' : 'warn',
          `${proposed.length} competitor${proposed.length === 1 ? '' : 's'} proposed, ${rivals.length} kept after validation`,
          rivals.length
            ? rivals.map((r) => `${r.name} — ${r.website}${r.reason ? ` (${r.reason})` : ''}`).join('\n')
            : 'Dropped: self-references, duplicates, or entries without a valid website.',
        );
      }
    } catch (err) {
      profile = this.fallbacks.profileFromPages(
        input.companyName,
        input.domain,
        input.website,
        site.pages,
      );
      rivals = []; // AI unreachable → no invented competitors
      log(
        'warn',
        'AI service unreachable — built a heuristic profile; no competitors will be invented',
        err instanceof Error ? err.message : String(err),
      );
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
