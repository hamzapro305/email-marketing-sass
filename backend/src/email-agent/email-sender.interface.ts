import { LeadDocument } from '../leads/lead.schema';

export interface SendResult {
  success: boolean;
  error?: string;
}

/**
 * The single contract shared by the demo simulator and the real SMTP sender.
 * The rest of the system is agnostic about which implementation is active.
 */
export interface IEmailSender {
  sendToLead(lead: LeadDocument): Promise<SendResult>;
}

/** DI token used to inject whichever sender the factory selected. */
export const EMAIL_SENDER = Symbol('EMAIL_SENDER');
