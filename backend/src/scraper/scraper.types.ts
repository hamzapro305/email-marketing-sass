/** One successfully scraped page, as consumed by research/analysis stages. */
export interface PageContent {
  url: string;
  title: string;
  description: string;
  text: string;
  wordCount: number;
  links: Array<{ href: string; text: string }>;
  socialLinks: string[];
  techHints: string[];
  fetchedAt: Date;
}

/** Deterministic, non-AI facts computed from a site's scraped pages. */
export interface WebsiteSignals {
  hasPricingPage: boolean;
  hasBlog: boolean;
  hasCareersPage: boolean;
  hasContactPage: boolean;
  missingMetaDescription: boolean;
  homepageWordCount: number;
  socialLinks: string[];
  techHints: string[];
  pagesScraped: number;
}

export interface SiteScrapeResult {
  domain: string;
  website: string;
  pages: PageContent[];
  signals: WebsiteSignals;
  /** Why nothing (or less than expected) was scraped, if applicable. */
  error: string | null;
}
