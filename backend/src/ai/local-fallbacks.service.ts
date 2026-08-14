import { Injectable } from '@nestjs/common';
import {
  AnalysisItem,
  AuditAnalysis,
  CompanyProfileData,
  RecommendationItem,
  RivalComparison,
  RivalData,
} from '../audits/audit.types';
import { PageContent, WebsiteSignals } from '../scraper/scraper.types';

/**
 * Deterministic stand-ins used when the AI service is unreachable. Everything
 * here is derived from actually-scraped data (never invented), so a degraded
 * audit is still truthful — just less polished than the AI version.
 */
@Injectable()
export class LocalFallbacksService {
  /** Company profile from scraped pages: description/meta first, no invention. */
  profileFromPages(
    name: string,
    domain: string,
    website: string,
    pages: PageContent[],
  ): CompanyProfileData {
    const home = pages[0];
    const summary =
      home?.description ||
      this.firstSentences(home?.text ?? '', 2) ||
      `No public website content could be read for ${name || domain}.`;
    return {
      name: name || domain,
      domain,
      website,
      summary,
      products: [],
      services: [],
      targetCustomers: '',
      positioning: home?.title ?? '',
      engine: 'fallback',
    };
  }

  /**
   * Signals-grounded analysis. Each finding cites the concrete signal that
   * produced it, mirroring what the AI service's own fallback does.
   */
  analysisFromSignals(
    company: CompanyProfileData,
    signals: WebsiteSignals | null,
    rivals: RivalData[],
  ): AuditAnalysis {
    const weaknesses: AnalysisItem[] = [];
    const gaps: AnalysisItem[] = [];
    const opportunities: AnalysisItem[] = [];
    const insights: string[] = [];
    const recommendations: RecommendationItem[] = [];

    const s = signals;
    if (s) {
      if (!s.hasPricingPage) {
        weaknesses.push({
          title: 'No public pricing page',
          detail:
            'Visitors cannot evaluate cost without contacting sales, which loses self-serve buyers.',
          evidence: `No pricing/plans page found among ${s.pagesScraped} scraped pages.`,
        });
      }
      if (!s.hasBlog) {
        weaknesses.push({
          title: 'No blog or content marketing',
          detail:
            'No content hub was found, limiting organic search traffic and buyer education.',
          evidence: 'No blog/news/insights section detected on the site.',
        });
      }
      if (s.missingMetaDescription) {
        weaknesses.push({
          title: 'Missing homepage meta description',
          detail:
            'Search engines will improvise the snippet, hurting click-through from search results.',
          evidence: 'The homepage has no <meta name="description">.',
        });
      }
      if (s.homepageWordCount > 0 && s.homepageWordCount < 150) {
        weaknesses.push({
          title: 'Very thin homepage copy',
          detail:
            'The homepage explains little about the offering, weakening both SEO and conversion.',
          evidence: `Homepage contains roughly ${s.homepageWordCount} words of visible text.`,
        });
      }
      if (s.socialLinks.length === 0) {
        weaknesses.push({
          title: 'No visible social presence',
          detail: 'No social profiles are linked from the website.',
          evidence: 'No LinkedIn/X/Facebook/Instagram links found on scraped pages.',
        });
      }
      if (s.techHints.length > 0) {
        insights.push(`Detected stack/tooling: ${s.techHints.join(', ')}.`);
      }

      // Gaps: things at least one rival has that the company lacks.
      const rivalWith = (pick: (r: WebsiteSignals) => boolean): RivalData[] =>
        rivals.filter((r) => r.signals && pick(r.signals));
      if (!s.hasPricingPage) {
        const names = rivalWith((r) => r.hasPricingPage).map((r) => r.name);
        if (names.length > 0) {
          gaps.push({
            title: 'Competitors publish pricing',
            detail: `${names.join(', ')} show pricing publicly while ${company.name} does not.`,
            evidence: 'Pricing pages found on competitor sites during scraping.',
          });
        }
      }
      if (!s.hasBlog) {
        const names = rivalWith((r) => r.hasBlog).map((r) => r.name);
        if (names.length > 0) {
          gaps.push({
            title: 'Competitors invest in content',
            detail: `${names.join(', ')} run active content sections while ${company.name} has none.`,
            evidence: 'Blog/insights sections found on competitor sites.',
          });
        }
      }
    }

    for (const w of weaknesses.slice(0, 4)) {
      opportunities.push({
        title: `Fix: ${w.title.toLowerCase()}`,
        detail: `Addressing this is a concrete, provable improvement — a natural outreach angle.`,
        evidence: w.evidence,
      });
      recommendations.push({
        title: w.title.replace(/^No /, 'Add ').replace(/^Missing /, 'Add '),
        detail: w.detail,
        priority: 'medium',
      });
    }

    const comparisons: RivalComparison[] = rivals.map((r) => ({
      rivalName: r.name,
      leadAdvantages: this.signalDiff(s, r.signals, true),
      rivalAdvantages: this.signalDiff(s, r.signals, false),
      notes: r.summary || r.reason || '',
    }));

    return {
      summary:
        `Heuristic audit of ${company.name} based on ${s?.pagesScraped ?? 0} scraped pages` +
        (rivals.length > 0
          ? ` and ${rivals.length} competitor site(s).`
          : ' (no competitor data available).'),
      weaknesses,
      gaps,
      opportunities,
      comparisons,
      insights,
      recommendations,
      engine: 'fallback',
    };
  }

  private signalDiff(
    ours: WebsiteSignals | null,
    theirs: WebsiteSignals | null,
    ourAdvantages: boolean,
  ): string[] {
    if (!ours || !theirs) return [];
    const [a, b] = ourAdvantages ? [ours, theirs] : [theirs, ours];
    const out: string[] = [];
    if (a.hasPricingPage && !b.hasPricingPage) out.push('Public pricing page');
    if (a.hasBlog && !b.hasBlog) out.push('Active blog/content');
    if (a.hasCareersPage && !b.hasCareersPage) out.push('Careers page (hiring signal)');
    if (a.socialLinks.length > 0 && b.socialLinks.length === 0)
      out.push('Visible social presence');
    if (a.homepageWordCount > b.homepageWordCount * 2 && a.homepageWordCount > 300)
      out.push('Substantially richer homepage content');
    return out;
  }

  private firstSentences(text: string, count: number): string {
    const sentences = text.match(/[^.!?]+[.!?]+/g);
    if (!sentences) return text.slice(0, 240);
    return sentences.slice(0, count).join(' ').trim().slice(0, 400);
  }
}
