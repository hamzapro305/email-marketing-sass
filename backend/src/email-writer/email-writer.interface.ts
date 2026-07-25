import { AiSettingsData } from '../settings/settings.service';

/** The email an AI writer produces for a single lead. */
export interface ComposedEmail {
  subject: string;
  body: string;
}

/** Minimal lead shape the writer personalizes against. */
export interface WriterLead {
  email: string;
  firstName?: string;
  lastName?: string;
  company?: string;
  title?: string;
}

/** Campaign context passed to the writer. */
export interface WriterCampaign {
  name: string;
  subject?: string;
  description?: string;
}

export interface WriteInput {
  /** The session whose configured LLM account should write this email. */
  sessionId: string;
  lead: WriterLead;
  campaign: WriterCampaign;
  settings: AiSettingsData;
}

export interface IEmailWriter {
  write(input: WriteInput): Promise<ComposedEmail>;
}
