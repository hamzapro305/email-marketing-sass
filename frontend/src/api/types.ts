export type LeadStatus = 'pending' | 'sending' | 'sent' | 'failed';
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
  campaignId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Campaign {
  _id: string;
  name: string;
  status: CampaignStatus;
  totalLeads: number;
  sentCount: number;
  failedCount: number;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ImportResult {
  imported: number;
  skipped: number;
  leads: Lead[];
}

/** A row parsed locally before upload — used for the preview + JSON import. */
export interface ParsedLead {
  email: string;
  firstName?: string;
  lastName?: string;
  company?: string;
  title?: string;
}
