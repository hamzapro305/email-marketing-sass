import type {
  Campaign,
  ImportResult,
  Lead,
  ParsedLead,
} from './types';

// Backend base URL. Defaults to the local dev backend; override at runtime by
// setting `window.__API_URL__` (e.g. from an Electron preload) if needed.
const API_BASE =
  (globalThis as { __API_URL__?: string }).__API_URL__ ??
  'http://localhost:3000/api';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      headers:
        init?.body instanceof FormData
          ? undefined
          : { 'Content-Type': 'application/json' },
      ...init,
    });
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

  // 204 No Content etc.
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  /** Import already-parsed rows as pending leads. */
  importLeads(leads: ParsedLead[]): Promise<ImportResult> {
    return request<ImportResult>('/leads/import', {
      method: 'POST',
      body: JSON.stringify({ leads }),
    });
  },

  /** Import by uploading the raw file (backend does tolerant column mapping). */
  importFile(file: File): Promise<ImportResult> {
    const form = new FormData();
    form.append('file', file);
    return request<ImportResult>('/leads/import', {
      method: 'POST',
      body: form,
    });
  },

  listLeads(): Promise<Lead[]> {
    return request<Lead[]>('/leads');
  },

  clearLeads(): Promise<{ deleted: number }> {
    return request<{ deleted: number }>('/leads', { method: 'DELETE' });
  },

  createCampaign(name?: string): Promise<Campaign> {
    return request<Campaign>('/campaigns', {
      method: 'POST',
      body: JSON.stringify(name ? { name } : {}),
    });
  },

  getCampaign(id: string): Promise<Campaign> {
    return request<Campaign>(`/campaigns/${id}`);
  },

  getCampaignLeads(id: string): Promise<Lead[]> {
    return request<Lead[]>(`/campaigns/${id}/leads`);
  },
};

export { API_BASE };
