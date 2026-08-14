import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { LeadDocument } from '../leads/lead.schema';
import { ResolvedSmtpConfig } from '../smtp-accounts/smtp-accounts.service';
import { SendResult } from './email-sender.interface';

/** What actually gets delivered — subject + plain-text body. */
export interface OutgoingEmail {
  subject: string;
  body: string;
}

/** Deliverability extras attached to each message. */
export interface SendOptions {
  /** Public one-click unsubscribe URL (List-Unsubscribe / RFC 8058). */
  unsubscribeUrl?: string;
}

/**
 * Sends audit-generated emails over SMTP using a caller-supplied account
 * config (the session's default SMTP account), and works with any provider —
 * Gmail, Outlook, Zoho, SES, Mailgun, self-hosted, … — by normalizing the
 * port/TLS combination instead of trusting the stored `secure` flag blindly:
 *
 *   port 465            → implicit TLS  (secure: true)
 *   port 587 / 25 / any → STARTTLS      (secure: false; required on 587)
 *
 * The #1 real-world failure ("Gmail doesn't work") is `secure: true` on port
 * 587 or `secure: false` on 465 — both are silently corrected here. Auth
 * failures come back with provider-aware hints (e.g. Gmail App Passwords).
 *
 * Nodemailer transporters are cached per account so a campaign reuses one
 * connection pool instead of reconnecting for every lead.
 */
@Injectable()
export class MailSenderService {
  private readonly logger = new Logger(MailSenderService.name);
  private readonly transporters = new Map<
    string,
    { key: string; transporter: nodemailer.Transporter }
  >();

  private getTransporter(smtp: ResolvedSmtpConfig): nodemailer.Transporter {
    // Include connection-defining fields so edits to an account rebuild it.
    const key = `${smtp.host}:${smtp.port}:${smtp.secure}:${smtp.user}:${smtp.pass}`;
    const cached = this.transporters.get(smtp.id);
    if (cached && cached.key === key) return cached.transporter;

    const transporter = nodemailer.createTransport(this.transportOptions(smtp));
    this.transporters.set(smtp.id, { key, transporter });
    return transporter;
  }

  /** Provider-agnostic transport options with the port/TLS mismatch fixed. */
  private transportOptions(
    smtp: ResolvedSmtpConfig,
  ): nodemailer.TransportOptions {
    // Implicit TLS is a property of the port, not of user preference — trust
    // the port over the stored flag and log when we had to correct it.
    const secure = smtp.port === 465;
    if (secure !== smtp.secure) {
      this.logger.log(
        `SMTP ${smtp.host}:${smtp.port}: adjusting TLS mode to ` +
          `${secure ? 'implicit TLS' : 'STARTTLS'} (stored secure=${smtp.secure}).`,
      );
    }

    return {
      host: smtp.host,
      port: smtp.port,
      secure,
      // Port 587 is submission-with-STARTTLS by definition — never downgrade
      // to plaintext there. Other non-TLS ports stay opportunistic so plain
      // internal relays keep working.
      requireTLS: smtp.port === 587,
      auth: { user: smtp.user, pass: smtp.pass },
      pool: true,
      maxConnections: 5,
      maxMessages: 100,
      connectionTimeout: 15_000,
      greetingTimeout: 10_000,
      socketTimeout: 60_000,
    } as nodemailer.TransportOptions;
  }

  async sendToLead(
    smtp: ResolvedSmtpConfig,
    lead: LeadDocument,
    email: OutgoingEmail,
    options: SendOptions = {},
  ): Promise<SendResult> {
    try {
      // List-Unsubscribe (+ one-click POST) — required by Gmail/Yahoo for
      // bulk senders and a strong inbox-placement signal for everyone else.
      const unsubTargets = [
        options.unsubscribeUrl ? `<${options.unsubscribeUrl}>` : null,
        `<mailto:${smtp.user}?subject=unsubscribe>`,
      ].filter(Boolean);
      const headers: Record<string, string> = {
        'List-Unsubscribe': unsubTargets.join(', '),
      };
      if (options.unsubscribeUrl) {
        headers['List-Unsubscribe-Post'] = 'List-Unsubscribe=One-Click';
      }

      await this.getTransporter(smtp).sendMail({
        from: smtp.from,
        to: lead.email,
        subject: email.subject,
        text: email.body,
        html: this.toHtml(email.body),
        headers,
      });
      this.logger.log(`✓ Email sent to ${lead.email} via ${smtp.host}`);
      return { success: true };
    } catch (err) {
      const message = this.friendlyError(err, smtp);
      this.logger.error(`✗ Failed to send to ${lead.email}: ${message}`);
      return { success: false, error: message };
    }
  }

  /** Verify credentials/connectivity for an account (used by "Test" in the UI). */
  async verify(smtp: ResolvedSmtpConfig): Promise<SendResult> {
    try {
      await this.getTransporter(smtp).verify();
      return { success: true };
    } catch (err) {
      return { success: false, error: this.friendlyError(err, smtp) };
    }
  }

  /** Plain text → safe HTML (escape first, then convert newlines). */
  private toHtml(body: string): string {
    const escaped = body
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    return `<p>${escaped.replace(/\n/g, '<br>')}</p>`;
  }

  /**
   * Translate raw SMTP/socket errors into messages a user can act on,
   * including provider-specific guidance for the common cases.
   */
  private friendlyError(err: unknown, smtp: ResolvedSmtpConfig): string {
    const raw =
      err instanceof Error ? err.message : String(err ?? 'Unknown SMTP error');
    const code = (err as { code?: string })?.code ?? '';
    const host = smtp.host.toLowerCase();

    if (code === 'EAUTH' || /535|invalid login|auth/i.test(raw)) {
      if (host.includes('gmail')) {
        return (
          'Gmail rejected the login. Gmail requires an App Password: enable ' +
          '2-Step Verification, then create one at Google Account → Security → ' +
          'App passwords, and use it instead of your normal password. ' +
          `(${raw.slice(0, 200)})`
        );
      }
      if (host.includes('office365') || host.includes('outlook')) {
        return (
          'Outlook/Microsoft 365 rejected the login. Check that SMTP AUTH is ' +
          'enabled for the mailbox and use an app password if MFA is on. ' +
          `(${raw.slice(0, 200)})`
        );
      }
      return `Authentication failed — check the username/password (or app password). (${raw.slice(0, 200)})`;
    }

    if (/wrong version number|ssl3|handshake/i.test(raw)) {
      return (
        `TLS mismatch talking to ${smtp.host}:${smtp.port} — try port 465 ` +
        `(implicit TLS) or 587 (STARTTLS). (${raw.slice(0, 150)})`
      );
    }

    if (code === 'ETIMEDOUT' || code === 'ESOCKET' || code === 'ECONNECTION') {
      return (
        `Could not reach ${smtp.host}:${smtp.port} — check the host/port and ` +
        `that your network allows outbound SMTP. (${raw.slice(0, 150)})`
      );
    }

    if (code === 'EENVELOPE' || /from address|sender address|550/i.test(raw)) {
      return (
        `The server rejected the message envelope — many providers require the ` +
        `From address to match the authenticated account (${smtp.user}). ` +
        `(${raw.slice(0, 200)})`
      );
    }

    return raw.slice(0, 500);
  }
}
