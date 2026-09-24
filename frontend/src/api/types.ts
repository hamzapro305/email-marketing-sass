export type LeadStatus =
  | 'pending'
  | 'queued'
  | 'researching'
  | 'analyzing'
  | 'writing'
  | 'ready'
  | 'sending'
  | 'sent'
  | 'failed';
export type CampaignStatus = 'draft' | 'running' | 'completed' | 'failed';

/** Statuses that mean a worker is actively moving this lead. */
export const ACTIVE_LEAD_STATUSES: LeadStatus[] = [
  'queued',
  'researching',
  'analyzing',
  'writing',
  'sending',
];

export interface Lead {
  _id: string;
  email: string;
  firstName: string;
  lastName: string;
  company: string;
  title: string;
  website?: string;
  phone?: string;
  industry?: string;
  location?: string;
  linkedinUrl?: string;
  companyDomain?: string;
  status: LeadStatus;
  errorMessage: string | null;
  sentAt: string | null;
  /** The AI-written email that was sent (populated during a run). */
  generatedSubject?: string | null;
  generatedBody?: string | null;
  campaignId: string | null;
  /** Present on cross-campaign lead views (`/leads`). */
  campaignName?: string | null;
  sessionId?: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Paged envelope returned by GET /leads. */
export interface PagedLeads {
  items: Lead[];
  total: number;
  page: number;
  pageSize: number;
}

export interface Campaign {
  _id: string;
  name: string;
  description: string;
  status: CampaignStatus;
  totalLeads: number;
  sentCount: number;
  failedCount: number;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  sessionId?: string | null;
}

/** A file uploaded into a campaign. */
export interface CampaignFile {
  _id: string;
  campaignId: string;
  sessionId: string;
  originalName: string;
  size: number;
  leadCount: number;
  skipped: number;
  /** How many of this file's leads are still pending. */
  pendingCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface UploadResult {
  file: CampaignFile;
  imported: number;
  /** Rows without a valid email. */
  skipped: number;
  /** Rows dropped as duplicates (within the file or already in the campaign). */
  duplicates: number;
  /** Structural problems the parser noticed (ragged rows, missing website column…). */
  warnings?: string[];
}

export interface CreateCampaignInput {
  name: string;
  description?: string;
}

// ── AI email-writing settings ──────────────────────────────────
export type EmailTone =
  | 'professional'
  | 'friendly'
  | 'casual'
  | 'concise'
  | 'persuasive';

/** AI settings as returned by the API (API key masked). */
export interface AiSettings {
  provider: string;
  model: string;
  temperature: number;
  senderName: string;
  senderCompany: string;
  senderRole: string;
  tone: EmailTone;
  language: string;
  wordLimit: number;
  callToAction: string;
  instructions: string;
  hasApiKey: boolean;
  apiKeyMasked: string;
}

/** Fields the user can edit (apiKey only sent when changed). */
export type AiSettingsInput = Partial<
  Omit<AiSettings, 'hasApiKey' | 'apiKeyMasked' | 'provider'>
> & { apiKey?: string };

export interface ComposedEmail {
  subject: string;
  body: string;
}

// ── SMTP sending accounts ──────────────────────────────────────
/** An SMTP account as returned by the API (password masked). */
export interface SmtpAccount {
  _id: string;
  label: string;
  host: string;
  port: number;
  secure: boolean;
  user: string;
  fromName: string;
  fromEmail: string;
  isDefault: boolean;
  hasPass: boolean;
  passMasked: string;
  createdAt: string;
  updatedAt: string;
}

/** Fields the user submits when adding/editing an account. */
export interface SmtpAccountInput {
  label: string;
  host: string;
  port: number;
  secure?: boolean;
  user: string;
  /** Omitted/blank on edit keeps the stored password. */
  pass?: string;
  fromName?: string;
  fromEmail?: string;
  isDefault?: boolean;
}

/** Result of a "Test connection" call. */
export interface SmtpTestResult {
  success: boolean;
  error?: string;
}

// ── LLM providers (AI writer) ──────────────────────────────────
export type LlmProvider = 'gemini' | 'openai' | 'kimi' | 'ollama';

/** An LLM account as returned by the API (API key masked). */
export interface LlmAccount {
  _id: string;
  label: string;
  provider: LlmProvider;
  model: string;
  apiBase: string;
  temperature: number;
  isDefault: boolean;
  hasApiKey: boolean;
  apiKeyMasked: string;
  createdAt: string;
  updatedAt: string;
}

/** Fields the user submits when adding/editing an LLM. */
export interface LlmAccountInput {
  label: string;
  provider: LlmProvider;
  model: string;
  /** Omitted/blank on edit keeps the stored key. Not used for Ollama. */
  apiKey?: string;
  /** Ollama base URL, or optional Kimi region base. */
  apiBase?: string;
  temperature?: number;
  isDefault?: boolean;
}

/** Result of a "Test" call against an LLM. */
export interface LlmTestResult {
  success: boolean;
  engine?: string;
  error?: string;
}

/** A row parsed locally before upload — used for the preview count. */
export interface ParsedLead {
  email: string;
  firstName?: string;
  lastName?: string;
  company?: string;
  title?: string;
  website?: string;
}

// ── Lead audit (the structured research pipeline output) ───────

export type AuditStage =
  | 'process'
  | 'research'
  | 'rivals'
  | 'scrape'
  | 'analyze'
  | 'email';

export const AUDIT_STAGE_ORDER: AuditStage[] = [
  'process',
  'research',
  'rivals',
  'scrape',
  'analyze',
  'email',
];

export const AUDIT_STAGE_LABELS: Record<AuditStage, string> = {
  process: 'Lead processing',
  research: 'Company research',
  rivals: 'Rival discovery',
  scrape: 'Competitor scraping',
  analyze: 'Analysis',
  email: 'Email generation',
};

export type StageStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface StageState {
  status: StageStatus;
  startedAt: string | null;
  completedAt: string | null;
  durationMs: number | null;
  error: string | null;
}

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

export interface ScrapedPageRef {
  url: string;
  title: string;
  description: string;
  wordCount: number;
  excerpt: string;
  fetchedAt: string;
}

export interface CompanyProfile {
  name: string;
  domain: string;
  website: string;
  summary: string;
  products: string[];
  services: string[];
  targetCustomers: string;
  positioning: string;
  engine: string;
}

export interface Rival {
  name: string;
  website: string;
  domain: string;
  reason: string;
  summary: string;
  signals: WebsiteSignals | null;
  pages: ScrapedPageRef[];
}

export interface AnalysisItem {
  title: string;
  detail: string;
  evidence: string;
}

export interface RivalComparison {
  rivalName: string;
  leadAdvantages: string[];
  rivalAdvantages: string[];
  notes: string;
}

export interface Recommendation {
  title: string;
  detail: string;
  priority: 'high' | 'medium' | 'low';
}

export interface AuditAnalysis {
  summary: string;
  weaknesses: AnalysisItem[];
  gaps: AnalysisItem[];
  opportunities: AnalysisItem[];
  comparisons: RivalComparison[];
  insights: string[];
  recommendations: Recommendation[];
  engine: string;
}

export interface GeneratedEmail {
  subject: string;
  body: string;
  engine: string;
}

export type AuditLogLevel = 'info' | 'success' | 'warn' | 'error';

/** One line of the audit's step-by-step activity trace. */
export interface AuditLogEntry {
  at: string;
  stage: AuditStage | 'run';
  level: AuditLogLevel;
  message: string;
  detail?: string;
}

export interface LeadAudit {
  _id: string;
  leadId: string;
  campaignId: string | null;
  sessionId: string;
  runId: string;
  send: boolean;
  status: 'running' | 'completed' | 'failed';
  stages: Record<AuditStage, StageState>;
  company: CompanyProfile | null;
  companySignals: WebsiteSignals | null;
  companyPages: ScrapedPageRef[];
  rivals: Rival[];
  analysis: AuditAnalysis | null;
  email: GeneratedEmail | null;
  /** Step-by-step trace of what the pipeline did and why. */
  activity?: AuditLogEntry[];
  error: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}
