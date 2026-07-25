import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { LeadDocument } from '../leads/lead.schema';
import { ComposedEmail } from '../email-writer/email-writer.interface';
import { ResolvedSmtpConfig } from '../smtp-accounts/smtp-accounts.service';
import { SendResult } from './email-sender.interface';

/**
 * Sends AI-written emails over SMTP using a caller-supplied account config
 * (the session's default SMTP account). Nodemailer transporters are cached per
 * account so a campaign reuses one connection pool instead of reconnecting for
 * every lead.
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

    const transporter = nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.secure,
      auth: { user: smtp.user, pass: smtp.pass },
      pool: true,
    });
    this.transporters.set(smtp.id, { key, transporter });
    return transporter;
  }

  async sendToLead(
    smtp: ResolvedSmtpConfig,
    lead: LeadDocument,
    email: ComposedEmail,
  ): Promise<SendResult> {
    try {
      await this.getTransporter(smtp).sendMail({
        from: smtp.from,
        to: lead.email,
        subject: email.subject,
        text: email.body,
        html: `<p>${email.body.replace(/\n/g, '<br>')}</p>`,
      });
      this.logger.log(`✓ Email sent to ${lead.email} via ${smtp.host}`);
      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown SMTP error';
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
      const message = err instanceof Error ? err.message : 'Unknown SMTP error';
      return { success: false, error: message };
    }
  }
}
