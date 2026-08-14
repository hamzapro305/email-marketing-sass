import { AiSettingsData } from '../settings/settings.service';
import {
  AnalysisItem,
  AuditAnalysis,
  CompanyProfileData,
  RecommendationItem,
} from '../audits/audit.types';
import { WebsiteSignals } from '../scraper/scraper.types';

/** The email an AI writer produces for a single lead. */
export interface ComposedEmail {
  subject: string;
  body: string;
  engine: string;
}

/** Lead shape shared with the AI service. */
export interface WriterLead {
  email: string;
  firstName?: string;
  lastName?: string;
  company?: string;
  title?: string;
  website?: string;
  industry?: string;
  location?: string;
}

export interface WriterCampaign {
  name: string;
  description?: string;
}

/** Per-request LLM config forwarded to the AI service (user's account). */
export interface LlmWirePayload {
  provider: string;
  model: string;
  apiKey: string;
  apiBase: string;
  temperature: number;
}

/** Page content sent to the AI service for summarization/analysis. */
export interface WirePage {
  url: string;
  title: string;
  description: string;
  text: string;
}

// ── /research/brief (profile + rivals in ONE model call) ──────
export interface BriefRequest {
  company: { name: string; domain: string; website: string };
  industry: string;
  location: string;
  pages: WirePage[];
  signals: WebsiteSignals | null;
  maxRivals: number;
  llm?: LlmWirePayload;
}
export interface BriefResponse {
  profile: Omit<CompanyProfileData, 'domain' | 'website' | 'engine'>;
  rivals: Array<{ name: string; website: string; reason: string }>;
  engine: string;
}

// ── /audit/analyze ─────────────────────────────────────────────
// Company-scoped on purpose: nothing lead-specific enters the request, so one
// analysis per company domain is cached and reused for every lead there.
export interface AnalyzeRivalInput {
  name: string;
  website: string;
  summary: string;
  signals: WebsiteSignals | null;
  excerpts: string[];
}
export interface AnalyzeRequest {
  company: {
    profile: CompanyProfileData;
    industry: string;
    location: string;
    signals: WebsiteSignals | null;
    excerpts: string[];
  };
  rivals: AnalyzeRivalInput[];
  llm?: LlmWirePayload;
}
export interface AnalyzeResponse {
  analysis: Omit<AuditAnalysis, 'engine'>;
  engine: string;
}

// ── /email/write ───────────────────────────────────────────────
/** The audit distilled to what the email writer needs to be specific. */
export interface EmailAuditContext {
  companySummary: string;
  signals: WebsiteSignals | null;
  weaknesses: AnalysisItem[];
  opportunities: AnalysisItem[];
  rivalNames: string[];
  recommendations: RecommendationItem[];
  insights: string[];
}
export interface WriteEmailRequest {
  lead: WriterLead;
  campaign: WriterCampaign;
  settings: AiSettingsData;
  audit: EmailAuditContext | null;
  llm?: LlmWirePayload;
}

// ── /llm/test ──────────────────────────────────────────────────
export interface LlmTestResponse {
  success: boolean;
  engine?: string;
  error?: string;
}
