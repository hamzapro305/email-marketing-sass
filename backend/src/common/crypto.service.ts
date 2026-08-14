import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'crypto';

const PREFIX = 'enc:v1:';

/**
 * At-rest encryption for user secrets (SMTP passwords, LLM API keys) using
 * AES-256-GCM. The key comes from the ENCRYPTION_KEY env var (any string —
 * it is hashed to 256 bits). Values are stored as
 * `enc:v1:<iv>:<authTag>:<ciphertext>` (base64url parts).
 *
 * Backward compatible by design: `decrypt` passes through values without the
 * prefix unchanged, so records written before encryption was enabled keep
 * working, and get encrypted the next time they are saved.
 *
 * Without ENCRYPTION_KEY the service stores plaintext and logs a warning —
 * fine for local dev, set the key in production.
 */
@Injectable()
export class CryptoService {
  private readonly logger = new Logger(CryptoService.name);
  private readonly key: Buffer | null;

  constructor(config: ConfigService) {
    const secret = config.get<string>('app.encryptionKey') ?? '';
    if (secret) {
      this.key = createHash('sha256').update(secret).digest();
    } else {
      this.key = null;
      this.logger.warn(
        'ENCRYPTION_KEY is not set — user secrets (SMTP passwords, API keys) ' +
          'are stored unencrypted. Set it in production.',
      );
    }
  }

  encrypt(plain: string): string {
    if (!plain || !this.key) return plain;
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    const encrypted = Buffer.concat([
      cipher.update(plain, 'utf8'),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();
    return (
      PREFIX +
      [iv, tag, encrypted].map((b) => b.toString('base64url')).join(':')
    );
  }

  decrypt(stored: string): string {
    if (!stored?.startsWith(PREFIX)) return stored; // legacy plaintext
    if (!this.key) {
      this.logger.error(
        'Found an encrypted secret but ENCRYPTION_KEY is not set — cannot decrypt.',
      );
      return '';
    }
    try {
      const [iv, tag, data] = stored
        .slice(PREFIX.length)
        .split(':')
        .map((part) => Buffer.from(part, 'base64url'));
      const decipher = createDecipheriv('aes-256-gcm', this.key, iv);
      decipher.setAuthTag(tag);
      return Buffer.concat([decipher.update(data), decipher.final()]).toString(
        'utf8',
      );
    } catch (err) {
      this.logger.error(
        `Failed to decrypt a stored secret (wrong ENCRYPTION_KEY?): ${
          err instanceof Error ? err.message : err
        }`,
      );
      return '';
    }
  }
}

/**
 * Clean up a pasted credential: strip surrounding whitespace/newlines, and
 * collapse the grouped format providers display secrets in — a Gmail App
 * Password is shown as `abcd efgh ijkl mnop` and pasting it verbatim causes
 * exactly the 535 BadCredentials failure users hit.
 */
export function normalizeSecret(raw: string): string {
  const trimmed = (raw ?? '').trim();
  // 16 letters in 4 space/dash-separated groups → a Google App Password.
  if (/^[a-zA-Z]{4}([\s-][a-zA-Z]{4}){3}$/.test(trimmed)) {
    return trimmed.replace(/[\s-]/g, '');
  }
  return trimmed;
}
