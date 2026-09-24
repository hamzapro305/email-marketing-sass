import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as cheerio from 'cheerio';
import { ScrapedPage, ScrapedPageDocument } from './scraped-page.schema';
import { PageContent, SiteScrapeResult, WebsiteSignals } from './scraper.types';
import { RedisCoordinationService } from '../redis/redis-coordination.service';
import { ScrapeConfig } from '../config/configuration';
import { StageLogger, noopStageLogger } from '../audits/audit.types';

const USER_AGENT =
  'Mozilla/5.0 (compatible; LeadAuditBot/1.0; +https://example.com/bot)';

// Paths worth reading beyond the homepage, in priority order. Matched against
// both the link's path and its anchor text.
const KEY_PAGE_PATTERNS: Array<{ pattern: RegExp; weight: number }> = [
  { pattern: /pricing|plans|packages/i, weight: 5 },
  { pattern: /product|features|platform|solutions|services/i, weight: 4 },
  { pattern: /about|company|who-we-are|our-story|team/i, weight: 3 },
  { pattern: /customers|case-stud|testimonials|clients|portfolio/i, weight: 2 },
  { pattern: /blog|news|resources|insights/i, weight: 1 },
];

const SOCIAL_HOSTS =
  /linkedin\.com|twitter\.com|x\.com|facebook\.com|instagram\.com|youtube\.com|tiktok\.com/i;

const TECH_SIGNATURES: Array<{ pattern: RegExp; name: string }> = [
  { pattern: /shopify/i, name: 'Shopify' },
  { pattern: /wp-content|wordpress/i, name: 'WordPress' },
  { pattern: /wix\.com|wixstatic/i, name: 'Wix' },
  { pattern: /squarespace/i, name: 'Squarespace' },
  { pattern: /webflow/i, name: 'Webflow' },
  { pattern: /hubspot|hs-scripts/i, name: 'HubSpot' },
  { pattern: /_next\/|__next/i, name: 'Next.js' },
  { pattern: /intercom/i, name: 'Intercom' },
  { pattern: /googletagmanager|gtag/i, name: 'Google Analytics' },
  { pattern: /stripe/i, name: 'Stripe' },
  { pattern: /calendly/i, name: 'Calendly' },
];

const MAX_TEXT_CHARS = 8_000;
const MAX_LINKS = 60;

/**
 * Fetches and parses public web pages, cache-first.
 *
 * Every fetch goes through: scrape cache (Mongo, TTL) → robots.txt check →
 * cross-replica per-domain politeness delay (Redis) → bounded fetch (timeout +
 * byte cap) → cheerio extraction. Failures are negative-cached so a dead
 * domain is not re-fetched by every lead that references it.
 */
@Injectable()
export class ScraperService {
  private readonly logger = new Logger(ScraperService.name);
  private readonly cfg: ScrapeConfig;

  constructor(
    @InjectModel(ScrapedPage.name)
    private readonly cacheModel: Model<ScrapedPageDocument>,
    private readonly coordination: RedisCoordinationService,
    config: ConfigService,
  ) {
    this.cfg = config.get<ScrapeConfig>('app.scrape')!;
  }

  /**
   * Scrape a company site: homepage first, then the most relevant same-site
   * pages discovered from its links (pricing, product, about, …), up to the
   * configured page budget. Returns whatever could be read plus deterministic
   * signals — a partially reachable site still produces a useful audit.
   */
  async scrapeSite(
    website: string,
    domain: string,
    log: StageLogger = noopStageLogger,
  ): Promise<SiteScrapeResult> {
    const pages: PageContent[] = [];
    let error: string | null = null;

    const home = await this.fetchPageDetailed(website, domain);
    if (home.page) {
      pages.push(home.page);
      log('success', `Read homepage ${home.page.url}`, describePage(home));
      const candidates = this.discoverKeyPages(home.page, website);
      const budget = candidates.slice(0, this.cfg.maxPagesPerSite - 1);
      log(
        'info',
        `Found ${candidates.length} key page${candidates.length === 1 ? '' : 's'} ` +
          `(pricing, product, about…) — reading up to ${budget.length}`,
        budget.length ? budget.join('\n') : undefined,
      );
      for (const url of budget) {
        const res = await this.fetchPageDetailed(url, domain);
        if (res.page) {
          pages.push(res.page);
          log('success', `Read ${res.page.url}`, describePage(res));
        } else {
          log('warn', `Skipped ${url}`, res.error ?? undefined);
        }
      }
    } else {
      error = `Could not fetch ${website}${home.error ? ` — ${home.error}` : ''}`;
      log('warn', `Could not read ${website}`, home.error ?? undefined);
    }

    return {
      domain,
      website,
      pages,
      signals: this.computeSignals(pages),
      error,
    };
  }

  /** Fetch one page through the cache. Returns null on any failure. */
  async fetchPage(url: string, domain: string): Promise<PageContent | null> {
    return (await this.fetchPageDetailed(url, domain)).page;
  }

  /**
   * Like {@link fetchPage} but also reports *why* a page is unavailable and
   * whether it came from the cache — the audit trace shows both.
   */
  async fetchPageDetailed(url: string, domain: string): Promise<PageFetch> {
    const normalized = this.normalizeUrl(url);
    if (!normalized) {
      return { page: null, cached: false, error: `Not a valid http(s) URL: ${url}` };
    }

    const cached = await this.cacheModel.findOne({ url: normalized }).lean().exec();
    if (cached) {
      return cached.status === 'ok'
        ? { page: this.toContent(cached), cached: true, error: null }
        : {
            page: null,
            cached: true,
            error: `${cached.error ?? 'Previous fetch failed'} (cached result)`,
          };
    }

    if (!(await this.isAllowedByRobots(normalized, domain))) {
      await this.cacheNegative(normalized, domain, null, 'Disallowed by robots.txt');
      return { page: null, cached: false, error: 'Disallowed by robots.txt' };
    }

    // Cross-replica politeness: at most one hit per domain per delay window.
    await this.coordination.waitForDomainSlot(domain, this.cfg.minDomainDelayMs);

    try {
      const html = await this.fetchRaw(normalized);
      const parsed = this.parseHtml(html, normalized);
      const doc = await this.cacheModel
        .findOneAndUpdate(
          { url: normalized },
          {
            $set: {
              domain,
              status: 'ok',
              httpStatus: 200,
              error: null,
              ...parsed,
              fetchedAt: new Date(),
              expiresAt: this.expiry(),
            },
          },
          { new: true, upsert: true },
        )
        .lean()
        .exec();
      return { page: this.toContent(doc), cached: false, error: null };
    } catch (err) {
      const message = describeFetchError(err, this.cfg.timeoutMs);
      const httpStatus =
        err instanceof HttpStatusError ? err.status : null;
      this.logger.debug(`Scrape failed ${normalized}: ${message}`);
      await this.cacheNegative(normalized, domain, httpStatus, message);
      return { page: null, cached: false, error: message };
    }
  }

  /** Deterministic site facts — computed here, not by the AI. */
  computeSignals(pages: PageContent[]): WebsiteSignals {
    const home = pages[0];
    const matches = (re: RegExp) =>
      pages.some(
        (p) =>
          re.test(new URL(p.url).pathname) ||
          p.links.some((l) => re.test(l.href) || re.test(l.text)),
      );
    return {
      hasPricingPage: matches(/pricing|plans|packages/i),
      hasBlog: matches(/blog|news|insights|articles|resources|learn|guides/i),
      hasCareersPage: matches(/careers|jobs|join-us|hiring/i),
      hasContactPage: matches(/contact|get-in-touch|talk-to/i),
      missingMetaDescription: !!home && !home.description,
      homepageWordCount: home?.wordCount ?? 0,
      socialLinks: [...new Set(pages.flatMap((p) => p.socialLinks))].slice(0, 10),
      techHints: [...new Set(pages.flatMap((p) => p.techHints))],
      pagesScraped: pages.length,
    };
  }

  // ── internals ────────────────────────────────────────────────

  private normalizeUrl(url: string): string | null {
    try {
      const u = new URL(url);
      if (!/^https?:$/.test(u.protocol)) return null;
      u.hash = '';
      u.search = '';
      return u.toString();
    } catch {
      return null;
    }
  }

  /** Bounded fetch: timeout, redirect-safe, HTML-only, byte cap. */
  private async fetchRaw(url: string): Promise<string> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.cfg.timeoutMs);
    try {
      const res = await fetch(url, {
        signal: controller.signal,
        redirect: 'follow',
        headers: {
          'User-Agent': USER_AGENT,
          Accept: 'text/html,application/xhtml+xml',
        },
      });
      if (!res.ok) throw new HttpStatusError(res.status);
      const type = res.headers.get('content-type') ?? '';
      if (!type.includes('text/html') && !type.includes('xhtml')) {
        throw new Error(`Not HTML (${type || 'unknown content-type'})`);
      }
      return await this.readCapped(res, this.cfg.maxBytes);
    } finally {
      clearTimeout(timer);
    }
  }

  private async readCapped(res: Response, maxBytes: number): Promise<string> {
    if (!res.body) return '';
    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      chunks.push(value);
      if (total >= maxBytes) {
        await reader.cancel().catch(() => undefined);
        break;
      }
    }
    return Buffer.concat(chunks).toString('utf8');
  }

  private parseHtml(html: string, url: string) {
    const $ = cheerio.load(html);
    const origin = new URL(url).origin;

    const techHints = new Set<string>();
    const htmlSample = html.slice(0, 200_000);
    for (const { pattern, name } of TECH_SIGNATURES) {
      if (pattern.test(htmlSample)) techHints.add(name);
    }
    const generator = $('meta[name="generator"]').attr('content');
    if (generator) techHints.add(generator.split(/\s+/)[0]);

    const socialLinks = new Set<string>();
    const links: Array<{ href: string; text: string }> = [];
    $('a[href]').each((_, el) => {
      const href = ($(el).attr('href') ?? '').trim();
      if (!href || href.startsWith('#') || href.startsWith('mailto:')) return;
      let abs: URL;
      try {
        abs = new URL(href, origin);
      } catch {
        return;
      }
      if (SOCIAL_HOSTS.test(abs.hostname)) {
        socialLinks.add(`${abs.origin}${abs.pathname}`.replace(/\/$/, ''));
        return;
      }
      if (abs.origin === origin && links.length < MAX_LINKS) {
        links.push({
          href: abs.pathname,
          text: $(el).text().replace(/\s+/g, ' ').trim().slice(0, 80),
        });
      }
    });

    $('script, style, noscript, svg, iframe').remove();
    const text = $('body')
      .text()
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, MAX_TEXT_CHARS);

    return {
      title: ($('title').first().text() || '').replace(/\s+/g, ' ').trim().slice(0, 300),
      description: ($('meta[name="description"]').attr('content') ?? '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 500),
      text,
      wordCount: text ? text.split(' ').length : 0,
      links,
      socialLinks: [...socialLinks].slice(0, 10),
      techHints: [...techHints].slice(0, 10),
    };
  }

  /** Rank the homepage's same-site links and return the most audit-relevant. */
  private discoverKeyPages(home: PageContent, website: string): string[] {
    const origin = new URL(home.url).origin || website;
    const scored = new Map<string, number>();
    for (const link of home.links) {
      const path = link.href.replace(/\/$/, '');
      if (!path || path === '') continue;
      // Skip deep pages and obvious non-content.
      if (path.split('/').filter(Boolean).length > 2) continue;
      if (/\.(pdf|jpg|jpeg|png|gif|zip|mp4)$/i.test(path)) continue;
      if (/login|signin|signup|register|privacy|terms|cookie|legal/i.test(path)) continue;
      for (const { pattern, weight } of KEY_PAGE_PATTERNS) {
        if (pattern.test(path) || pattern.test(link.text)) {
          scored.set(path, Math.max(scored.get(path) ?? 0, weight));
          break;
        }
      }
    }
    return [...scored.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([path]) => `${origin}${path.startsWith('/') ? '' : '/'}${path}`);
  }

  /**
   * Light robots.txt compliance: honors `User-agent: *` Disallow prefixes.
   * The robots file itself is cached like any page (as a negative-size entry).
   */
  private async isAllowedByRobots(url: string, domain: string): Promise<boolean> {
    try {
      const origin = new URL(url).origin;
      const robotsUrl = `${origin}/robots.txt`;
      let rules = this.robotsCache.get(origin);
      if (rules === undefined) {
        rules = await this.loadRobots(robotsUrl, domain);
        this.robotsCache.set(origin, rules);
        if (this.robotsCache.size > 500) {
          const first = this.robotsCache.keys().next().value;
          if (first !== undefined) this.robotsCache.delete(first);
        }
      }
      const path = new URL(url).pathname;
      return !rules.some((prefix) => prefix !== '' && path.startsWith(prefix));
    } catch {
      return true; // no robots.txt → allowed
    }
  }

  private readonly robotsCache = new Map<string, string[]>();

  private async loadRobots(robotsUrl: string, domain: string): Promise<string[]> {
    await this.coordination.waitForDomainSlot(domain, this.cfg.minDomainDelayMs);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5_000);
    try {
      const res = await fetch(robotsUrl, {
        signal: controller.signal,
        headers: { 'User-Agent': USER_AGENT },
      });
      if (!res.ok) return [];
      const text = (await res.text()).slice(0, 100_000);
      // Collect Disallow rules from `User-agent: *` groups only.
      const rules: string[] = [];
      let appliesToUs = false;
      for (const rawLine of text.split('\n')) {
        const line = rawLine.split('#')[0].trim();
        const [key, ...rest] = line.split(':');
        const value = rest.join(':').trim();
        if (/^user-agent$/i.test(key)) {
          appliesToUs = value === '*';
        } else if (appliesToUs && /^disallow$/i.test(key)) {
          rules.push(value);
        }
      }
      return rules;
    } catch {
      return [];
    } finally {
      clearTimeout(timer);
    }
  }

  private async cacheNegative(
    url: string,
    domain: string,
    httpStatus: number | null,
    error: string,
  ): Promise<void> {
    await this.cacheModel
      .findOneAndUpdate(
        { url },
        {
          $set: {
            domain,
            status: 'error',
            httpStatus,
            error: error.slice(0, 500),
            title: '',
            description: '',
            text: '',
            wordCount: 0,
            links: [],
            socialLinks: [],
            techHints: [],
            fetchedAt: new Date(),
            // Failed fetches retry sooner than successful ones expire.
            expiresAt: new Date(Date.now() + 6 * 3_600_000),
          },
        },
        { upsert: true },
      )
      .exec()
      .catch(() => undefined);
  }

  private expiry(): Date {
    return new Date(Date.now() + this.cfg.cacheTtlHours * 3_600_000);
  }

  private toContent(doc: ScrapedPage): PageContent {
    return {
      url: doc.url,
      title: doc.title,
      description: doc.description,
      text: doc.text,
      wordCount: doc.wordCount,
      links: doc.links ?? [],
      socialLinks: doc.socialLinks ?? [],
      techHints: doc.techHints ?? [],
      fetchedAt: doc.fetchedAt,
    };
  }
}

/** Outcome of one page fetch, including the reason when it yields nothing. */
export interface PageFetch {
  page: PageContent | null;
  cached: boolean;
  error: string | null;
}

const describePage = (res: PageFetch): string => {
  const p = res.page!;
  return [
    p.title ? `Title: ${p.title}` : 'No <title>',
    p.description ? `Meta description: ${p.description}` : 'No meta description',
    `${p.wordCount} words · ${p.links.length} links` +
      (p.techHints.length ? ` · tech: ${p.techHints.join(', ')}` : ''),
    res.cached ? 'Served from scrape cache' : 'Fetched live',
  ].join('\n');
};

/**
 * Node's fetch reports every network failure as a bare "fetch failed" with the
 * real reason (DNS, TLS, refused, reset) hidden in `cause`; aborts surface as
 * a generic AbortError. Unwrap both so the audit trace says what happened.
 */
const describeFetchError = (err: unknown, timeoutMs: number): string => {
  if (!(err instanceof Error)) return 'Fetch failed';
  if (err.name === 'AbortError') return `Timed out after ${timeoutMs / 1000}s`;
  const cause = (err as Error & { cause?: unknown }).cause;
  if (cause instanceof Error && cause.message) {
    const code = (cause as Error & { code?: string }).code;
    return `${err.message}: ${cause.message}${code && !cause.message.includes(code) ? ` (${code})` : ''}`;
  }
  return err.message;
};

class HttpStatusError extends Error {
  constructor(readonly status: number) {
    super(`HTTP ${status}`);
  }
}
