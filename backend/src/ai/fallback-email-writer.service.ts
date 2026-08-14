import { Injectable } from '@nestjs/common';
import { ComposedEmail, WriteEmailRequest } from './ai.types';

/**
 * Local, deterministic email writer used when the AI service is unreachable.
 * Unlike a canned template, it works the audit's actual findings into the copy
 * (a concrete weakness + opportunity), so even the degraded path references
 * real research instead of generic filler.
 */
@Injectable()
export class FallbackEmailWriterService {
  write(req: WriteEmailRequest): ComposedEmail {
    const { lead, campaign, settings, audit } = req;
    const greeting = (lead.firstName || '').trim() || 'there';
    const company = (lead.company || 'your team').trim();

    const weakness = audit?.weaknesses?.[0];
    const opportunity = audit?.opportunities?.[0];
    const rivalNames = audit?.rivalNames?.slice(0, 2) ?? [];

    const subject = weakness
      ? `${company}: quick note on ${this.lower(weakness.title)}`
      : `Quick question about ${company}`;

    const lines: string[] = [`Hi ${greeting},`, ''];

    if (audit?.companySummary) {
      lines.push(
        `I spent some time on ${company}'s site — ${this.firstClause(audit.companySummary)}`,
        '',
      );
    } else {
      lines.push(`I've been looking at ${company} and had a thought to share.`, '');
    }

    if (weakness) {
      lines.push(`One thing stood out: ${this.lower(weakness.detail)}`, '');
    }
    if (rivalNames.length > 0 && opportunity) {
      lines.push(
        `Compared with ${rivalNames.join(' and ')}, that's a gap worth closing — ${this.lower(
          opportunity.detail,
        )}`,
        '',
      );
    }

    const value =
      campaign.description?.trim() ||
      'We help teams turn findings like these into pipeline.';
    lines.push(value, '');

    const cta = settings.callToAction?.trim() || 'a quick 15-minute call';
    lines.push(`Would you be open to ${cta}?`, '');

    const name = settings.senderName?.trim() || 'The team';
    const roleCompany = [settings.senderRole?.trim(), settings.senderCompany?.trim()]
      .filter(Boolean)
      .join(', ');
    lines.push('Best,', name);
    if (roleCompany) lines.push(roleCompany);

    return {
      subject,
      body: this.clampWords(lines.join('\n'), settings.wordLimit),
      engine: 'fallback',
    };
  }

  private lower(text: string): string {
    if (!text) return text;
    return text.charAt(0).toLowerCase() + text.slice(1);
  }

  private firstClause(text: string): string {
    const clause = text.split(/(?<=[.!?])\s/)[0] ?? text;
    const trimmed = clause.trim();
    return this.lower(trimmed.endsWith('.') ? trimmed : `${trimmed}.`);
  }

  private clampWords(text: string, wordLimit: number): string {
    if (!wordLimit || wordLimit <= 0) return text;
    const words = text.split(/\s+/);
    if (words.length <= wordLimit + 30) return text;
    return `${words.slice(0, wordLimit).join(' ')}…`;
  }
}
