import { Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { LeadDocument } from '../leads/lead.schema';
import { SmtpConfig } from '../config/configuration';
import { IEmailSender, SendResult } from './email-sender.interface';

/**
 * Live SMTP sender. Drop-in replacement for the demo agent, selected when
 * EMAIL_MODE=live. Uses nodemailer configured from SMTP_* env variables.
 */
export class SmtpEmailSender implements IEmailSender {
  private readonly logger = new Logger('SmtpEmailSender');
  private readonly transporter: nodemailer.Transporter;

  constructor(private readonly smtp: SmtpConfig) {
    this.transporter = nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.secure,
      auth: { user: smtp.user, pass: smtp.pass },
    });
  }

  async sendToLead(lead: LeadDocument): Promise<SendResult> {
    const name = [lead.firstName, lead.lastName].filter(Boolean).join(' ');
    const greeting = name || 'there';

    try {
      await this.transporter.sendMail({
        from: this.smtp.from,
        to: lead.email,
        subject: 'Hello from our team',
        text: `Hi ${greeting},\n\nWe'd love to connect.\n\nBest regards`,
        html: `<p>Hi ${greeting},</p><p>We'd love to connect.</p><p>Best regards</p>`,
      });
      this.logger.log(`✓ Email sent to ${lead.email}`);
      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown SMTP error';
      this.logger.error(`✗ Failed to send to ${lead.email}: ${message}`);
      return { success: false, error: message };
    }
  }
}
