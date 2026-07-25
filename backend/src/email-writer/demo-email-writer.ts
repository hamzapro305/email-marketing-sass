import { Injectable } from '@nestjs/common';
import {
  ComposedEmail,
  IEmailWriter,
  WriteInput,
  WriterLead,
} from './email-writer.interface';
import { EmailTone } from '../settings/ai-settings.schema';

/**
 * Demo email writer. Produces a realistic, personalized email from the
 * configured instructions + lead fields WITHOUT calling any AI API — the local
 * stand-in for the future Google ADK / Gemini agent. Deterministic-ish so the
 * same lead reads consistently, but varied across tones and leads.
 */
@Injectable()
export class DemoEmailWriter implements IEmailWriter {
  async write(input: WriteInput): Promise<ComposedEmail> {
    const { lead, campaign, settings } = input;
    const first = (lead.firstName || '').trim();
    const greetingName = first || 'there';
    const company = (lead.company || 'your team').trim();
    const role = (lead.title || '').trim();

    const subject = this.renderTags(
      campaign.subject?.trim() || this.subjectFor(settings.tone, company),
      lead,
    );

    const opener = this.openerFor(settings.tone, { company, role });
    const value =
      campaign.description?.trim() ||
      `We help teams like ${company} run outreach that actually gets replies.`;
    const cta = settings.callToAction?.trim() || 'reply if you are open to it';
    const signOff = this.signature(settings);

    const body = [
      `Hi ${greetingName},`,
      '',
      opener,
      '',
      value,
      '',
      `Would you be open to ${cta}?`,
      '',
      signOff,
    ].join('\n');

    // A tiny think-time so the "agent" feels like it's composing (still no API).
    await new Promise((r) => setTimeout(r, 40));
    return { subject, body: this.clampWords(body, settings.wordLimit) };
  }

  private subjectFor(tone: EmailTone, company: string): string {
    switch (tone) {
      case 'friendly':
        return `Quick idea for ${company} 👋`;
      case 'casual':
        return `${company} — worth a chat?`;
      case 'concise':
        return `${company}: 15 min?`;
      case 'persuasive':
        return `A faster path to pipeline for ${company}`;
      default:
        return `Quick question about ${company}`;
    }
  }

  private openerFor(
    tone: EmailTone,
    ctx: { company: string; role: string },
  ): string {
    const roleBit = ctx.role ? ` as ${ctx.role}` : '';
    switch (tone) {
      case 'friendly':
        return `I came across ${ctx.company} and loved what you're building${roleBit}.`;
      case 'casual':
        return `Been following ${ctx.company}${roleBit} — figured I'd reach out directly.`;
      case 'concise':
        return `Reaching out about ${ctx.company}${roleBit}.`;
      case 'persuasive':
        return `Teams like ${ctx.company} are leaving pipeline on the table — and it's fixable.`;
      default:
        return `I've been following ${ctx.company}${roleBit} and had a quick thought I wanted to share.`;
    }
  }

  private signature(s: WriteInput['settings']): string {
    const name = s.senderName?.trim() || 'The team';
    const role = s.senderRole?.trim();
    const company = s.senderCompany?.trim();
    const lines = [`Best,`, name];
    if (role || company) {
      lines.push([role, company].filter(Boolean).join(', '));
    }
    return lines.join('\n');
  }

  /** Replace {{firstName}}, {{company}} … merge tags. */
  private renderTags(text: string, lead: WriterLead): string {
    return text
      .replace(/\{\{\s*firstName\s*\}\}/gi, lead.firstName || 'there')
      .replace(/\{\{\s*lastName\s*\}\}/gi, lead.lastName || '')
      .replace(/\{\{\s*company\s*\}\}/gi, lead.company || 'your team')
      .replace(/\{\{\s*title\s*\}\}/gi, lead.title || '')
      .replace(/\{\{\s*email\s*\}\}/gi, lead.email || '');
  }

  private clampWords(text: string, wordLimit: number): string {
    // Only trims the prose paragraphs; keeps greeting + signature intact.
    if (!wordLimit || wordLimit <= 0) return text;
    const words = text.split(/\s+/);
    if (words.length <= wordLimit + 20) return text;
    return `${words.slice(0, wordLimit).join(' ')}…`;
  }
}
