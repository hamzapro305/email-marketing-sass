import { WebsiteSignals } from '../scraper/scraper.types';

/** AI-produced (or fallback) structured profile of a company. */
export interface CompanyProfileData {
  name: string;
  domain: string;
  website: string;
  summary: string;
  products: string[];
  services: string[];
  targetCustomers: string;
  positioning: string;
  /** Which engine produced the summary: provider name or 'fallback'. */
  engine: string;
}

/** A competitor discovered for the lead's company. */
export interface RivalData {
  name: string;
  website: string;
  domain: string;
  /** Why the AI (or heuristic) considers this a rival. */
  reason: string;
  /** Short scraped-content-grounded summary (filled by the scrape stage). */
  summary: string;
  signals: WebsiteSignals | null;
  /** Pages actually scraped from this rival's site. */
  pages: ScrapedPageRef[];
}

/** Lightweight reference to a scraped page stored on the audit. */
export interface ScrapedPageRef {
  url: string;
  title: string;
  description: string;
  wordCount: number;
  /** First part of the extracted text — evidence shown in the UI. */
  excerpt: string;
  fetchedAt: Date | string;
}

export interface AnalysisItem {
  title: string;
  detail: string;
  /** Grounding: which scraped fact/page supports this. */
  evidence: string;
}

export interface RivalComparison {
  rivalName: string;
  leadAdvantages: string[];
  rivalAdvantages: string[];
  notes: string;
}

export interface RecommendationItem {
  title: string;
  detail: string;
  priority: 'high' | 'medium' | 'low';
}

/** The AI analysis section of an audit. */
export interface AuditAnalysis {
  summary: string;
  weaknesses: AnalysisItem[];
  gaps: AnalysisItem[];
  opportunities: AnalysisItem[];
  comparisons: RivalComparison[];
  insights: string[];
  recommendations: RecommendationItem[];
  engine: string;
}

export interface GeneratedEmailData {
  subject: string;
  body: string;
  engine: string;
}

// ── Pipeline stage bookkeeping ─────────────────────────────────

export enum AuditStage {
  Process = 'process',
  Research = 'research',
  Rivals = 'rivals',
  Scrape = 'scrape',
  Analyze = 'analyze',
  Email = 'email',
}

/** Execution order of the pipeline stages. */
export const STAGE_ORDER: AuditStage[] = [
  AuditStage.Process,
  AuditStage.Research,
  AuditStage.Rivals,
  AuditStage.Scrape,
  AuditStage.Analyze,
  AuditStage.Email,
];

export type StageStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface StageState {
  status: StageStatus;
  startedAt: Date | null;
  completedAt: Date | null;
  durationMs: number | null;
  error: string | null;
}

export type AuditStages = Record<AuditStage, StageState>;

export const freshStageState = (): StageState => ({
  status: 'pending',
  startedAt: null,
  completedAt: null,
  durationMs: null,
  error: null,
});

export const freshStages = (): AuditStages =>
  Object.fromEntries(
    STAGE_ORDER.map((s) => [s, freshStageState()]),
  ) as AuditStages;
