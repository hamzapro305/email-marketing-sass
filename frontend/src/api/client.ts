import type {
  AiSettings,
  AiSettingsInput,
  Campaign,
  CampaignFile,
  ComposedEmail,
  CreateCampaignInput,
  Lead,
  LeadAudit,
  PagedLeads,
  LlmAccount,
  LlmAccountInput,
  LlmTestResult,
  SmtpAccount,
  SmtpAccountInput,
  SmtpTestResult,
  UploadResult,
} from './types';
import { getSessionId } from './session';

// Backend base URL. The SPA is served by the same nginx that proxies /api to
// the backend, so a relative "/api" works everywhere (the Vite dev server
// proxies it too). VITE_API_URL overrides it for cross-origin setups.
const API_BASE = (import.meta.env.VITE_API_URL as string | undefined) ?? '/api';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const isForm = init?.body instanceof FormData;
  const headers: Record<string, string> = {
    'x-session-id': getSessionId(),
    ...(isForm ? {} : { 'Content-Type': 'application/json' }),
    ...((init?.headers as Record<string, string>) ?? {}),
  };

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, { ...init, headers });
  } catch {
    throw new Error(
      'Cannot reach the backend. Is it running on ' + API_BASE + '?',
    );
  }

  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      if (body?.message) {
        message = Array.isArray(body.message)
          ? body.message.join(', ')
          : body.message;
      }
    } catch {
      /* ignore non-JSON error bodies */
    }
    throw new Error(message);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  // ── Campaigns ────────────────────────────────────────────────
  listCampaigns(): Promise<Campaign[]> {
    return request<Campaign[]>('/campaigns');
  },

  createCampaign(input: CreateCampaignInput): Promise<Campaign> {
    return request<Campaign>('/campaigns', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  getCampaign(id: string): Promise<Campaign> {
    return request<Campaign>(`/campaigns/${id}`);
  },

  deleteCampaign(id: string): Promise<{ deleted: boolean }> {
    return request<{ deleted: boolean }>(`/campaigns/${id}`, {
      method: 'DELETE',
    });
  },

  /** Start (or re-run) a campaign — enqueues its pending leads. */
  startCampaign(id: string): Promise<Campaign> {
    return request<Campaign>(`/campaigns/${id}/start`, { method: 'POST' });
  },

  getCampaignLeads(id: string): Promise<Lead[]> {
    return request<Lead[]>(`/campaigns/${id}/leads`);
  },

  // ── Campaign files ───────────────────────────────────────────
  uploadToCampaign(id: string, file: File): Promise<UploadResult> {
    const form = new FormData();
    form.append('file', file);
    return request<UploadResult>(`/campaigns/${id}/uploads`, {
      method: 'POST',
      body: form,
    });
  },

  listCampaignFiles(id: string): Promise<CampaignFile[]> {
    return request<CampaignFile[]>(`/campaigns/${id}/uploads`);
  },

  deleteCampaignFile(
    id: string,
    fileId: string,
  ): Promise<{ deletedLeads: number }> {
    return request<{ deletedLeads: number }>(
      `/campaigns/${id}/uploads/${fileId}`,
      { method: 'DELETE' },
    );
  },

  // ── Leads (across all campaigns) ─────────────────────────────
  listLeads(
    opts: {
      campaignId?: string;
      status?: string;
      q?: string;
      page?: number;
      pageSize?: number;
    } = {},
  ): Promise<PagedLeads> {
    const qs = new URLSearchParams();
    if (opts.campaignId) qs.set('campaignId', opts.campaignId);
    if (opts.status) qs.set('status', opts.status);
    if (opts.q) qs.set('q', opts.q);
    if (opts.page) qs.set('page', String(opts.page));
    if (opts.pageSize) qs.set('pageSize', String(opts.pageSize));
    const suffix = qs.toString() ? `?${qs.toString()}` : '';
    return request<PagedLeads>(`/leads${suffix}`);
  },

  getLead(id: string): Promise<Lead> {
    return request<Lead>(`/leads/${id}`);
  },

  // ── Lead audits (research pipeline output) ───────────────────
  getLeadAudit(id: string): Promise<LeadAudit> {
    return request<LeadAudit>(`/leads/${id}/audit`);
  },

  /** Run (or re-run) the audit pipeline for one lead — nothing is sent. */
  runLeadAudit(id: string): Promise<{ runId: string; leadId: string }> {
    return request<{ runId: string; leadId: string }>(`/leads/${id}/audit`, {
      method: 'POST',
    });
  },

  // ── AI settings (email writer) ───────────────────────────────
  getAiSettings(): Promise<AiSettings> {
    return request<AiSettings>('/settings/ai');
  },

  updateAiSettings(input: AiSettingsInput): Promise<AiSettings> {
    return request<AiSettings>('/settings/ai', {
      method: 'PUT',
      body: JSON.stringify(input),
    });
  },

  /** Generate a sample email with the current settings. */
  previewEmail(input: { description?: string } = {}): Promise<ComposedEmail> {
    return request<ComposedEmail>('/settings/ai/preview', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  // ── SMTP sending accounts ────────────────────────────────────
  listSmtpAccounts(): Promise<SmtpAccount[]> {
    return request<SmtpAccount[]>('/smtp-accounts');
  },

  createSmtpAccount(input: SmtpAccountInput): Promise<SmtpAccount> {
    return request<SmtpAccount>('/smtp-accounts', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  updateSmtpAccount(
    id: string,
    input: Partial<SmtpAccountInput>,
  ): Promise<SmtpAccount> {
    return request<SmtpAccount>(`/smtp-accounts/${id}`, {
      method: 'PUT',
      body: JSON.stringify(input),
    });
  },

  setDefaultSmtpAccount(id: string): Promise<SmtpAccount> {
    return request<SmtpAccount>(`/smtp-accounts/${id}/default`, {
      method: 'POST',
    });
  },

  testSmtpAccount(id: string): Promise<SmtpTestResult> {
    return request<SmtpTestResult>(`/smtp-accounts/${id}/test`, {
      method: 'POST',
    });
  },

  deleteSmtpAccount(id: string): Promise<{ deleted: boolean }> {
    return request<{ deleted: boolean }>(`/smtp-accounts/${id}`, {
      method: 'DELETE',
    });
  },

  // ── LLM providers (AI writer) ────────────────────────────────
  listLlmAccounts(): Promise<LlmAccount[]> {
    return request<LlmAccount[]>('/llm-accounts');
  },

  createLlmAccount(input: LlmAccountInput): Promise<LlmAccount> {
    return request<LlmAccount>('/llm-accounts', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  updateLlmAccount(
    id: string,
    input: Partial<LlmAccountInput>,
  ): Promise<LlmAccount> {
    return request<LlmAccount>(`/llm-accounts/${id}`, {
      method: 'PUT',
      body: JSON.stringify(input),
    });
  },

  setDefaultLlmAccount(id: string): Promise<LlmAccount> {
    return request<LlmAccount>(`/llm-accounts/${id}/default`, {
      method: 'POST',
    });
  },

  testLlmAccount(id: string): Promise<LlmTestResult> {
    return request<LlmTestResult>(`/llm-accounts/${id}/test`, {
      method: 'POST',
    });
  },

  deleteLlmAccount(id: string): Promise<{ deleted: boolean }> {
    return request<{ deleted: boolean }>(`/llm-accounts/${id}`, {
      method: 'DELETE',
    });
  },
};

export { API_BASE };
