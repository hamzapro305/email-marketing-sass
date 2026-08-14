import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { createHmac, timingSafeEqual } from 'crypto';
import { Model } from 'mongoose';
import { Suppression, SuppressionDocument } from './suppression.schema';

export interface UnsubscribePayload {
  sessionId: string;
  email: string;
}

/**
 * The unsubscribe/suppression list. Every outgoing email carries an
 * HMAC-signed unsubscribe token; redeeming it adds the recipient here, and
 * the send worker skips suppressed addresses forever after.
 *
 * Tokens are self-contained (`base64url(sessionId|email).signature`) so the
 * unsubscribe endpoint needs no session header and works from any mail
 * client's one-click POST.
 */
@Injectable()
export class SuppressionsService {
  private readonly logger = new Logger(SuppressionsService.name);
  private readonly secret: string;

  constructor(
    @InjectModel(Suppression.name)
    private readonly model: Model<SuppressionDocument>,
    config: ConfigService,
  ) {
    this.secret =
      config.get<string>('app.encryptionKey') || 'unsubscribe-dev-secret';
  }

  async isSuppressed(sessionId: string, email: string): Promise<boolean> {
    const found = await this.model
      .exists({ sessionId, email: email.toLowerCase() })
      .exec();
    return !!found;
  }

  async suppress(sessionId: string, email: string): Promise<void> {
    await this.model
      .updateOne(
        { sessionId, email: email.toLowerCase() },
        { $setOnInsert: { reason: 'unsubscribed' } },
        { upsert: true },
      )
      .exec();
    this.logger.log(`Suppressed ${email} for session ${sessionId}.`);
  }

  /** Signed token embedded in each email's unsubscribe link/header. */
  token(payload: UnsubscribePayload): string {
    const body = Buffer.from(
      `${payload.sessionId}|${payload.email.toLowerCase()}`,
    ).toString('base64url');
    return `${body}.${this.sign(body)}`;
  }

  /** Verify + decode a token; null when tampered or malformed. */
  verify(token: string): UnsubscribePayload | null {
    const [body, signature] = (token ?? '').split('.');
    if (!body || !signature) return null;
    const expected = this.sign(body);
    const a = Buffer.from(signature);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    const decoded = Buffer.from(body, 'base64url').toString('utf8');
    const sep = decoded.indexOf('|');
    if (sep <= 0) return null;
    return {
      sessionId: decoded.slice(0, sep),
      email: decoded.slice(sep + 1),
    };
  }

  private sign(body: string): string {
    return createHmac('sha256', this.secret).update(body).digest('base64url');
  }
}
