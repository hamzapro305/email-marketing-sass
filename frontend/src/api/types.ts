export type LeadStatus =
  | 'pending'
  | 'queued'
  | 'writing'
  | 'sending'
  | 'sent'
  | 'failed';
export type CampaignStatus = 'draft' | 'running' | 'completed' | 'failed';

export interface Lead {
  _id: string;
  email: string;
  firstName: string;
  lastName: string;
  company: string;
  title: string;
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
  skipped: number;
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
export type LlmProvider = 'gemini' | 'openai' | 'ollama';

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
  /** Ollama base URL. */
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
}
