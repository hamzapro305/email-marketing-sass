import { Inject, Injectable } from '@nestjs/common';
import Redis from 'ioredis';
import { REDIS_CLIENT } from './redis.constants';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Cross-replica coordination primitives built on Redis:
 *
 * - `acquireLock` / `releaseLock` — a best-effort distributed lock used to
 *   prevent N workers from researching the same company domain simultaneously
 *   (they'd all hit the same websites and burn the same AI tokens).
 * - `waitForDomainSlot` — polite scraping: guarantees a minimum delay between
 *   two fetches against the same external domain, across ALL workers.
 */
@Injectable()
export class RedisCoordinationService {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  /** Try to take a named lock. Returns a release token, or null if held. */
  async acquireLock(name: string, ttlMs: number): Promise<string | null> {
    const token = `${process.pid}:${Date.now()}:${Math.random()}`;
    const ok = await this.redis.set(`lock:${name}`, token, 'PX', ttlMs, 'NX');
    return ok === 'OK' ? token : null;
  }

  /** Release a lock, but only if we still own it. */
  async releaseLock(name: string, token: string): Promise<void> {
    // Compare-and-delete so an expired/stolen lock is never released by us.
    const script =
      'if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end';
    await this.redis.eval(script, 1, `lock:${name}`, token).catch(() => 0);
  }

  /**
   * Wait until this domain may be fetched again, then claim the next slot.
   * Bounded: gives up waiting after `maxWaitMs` and proceeds (a scrape being
   * slightly impolite beats a stuck pipeline).
   */
  async waitForDomainSlot(
    domain: string,
    minDelayMs: number,
    maxWaitMs = 30_000,
  ): Promise<void> {
    if (minDelayMs <= 0) return;
    const key = `scrape:slot:${domain}`;
    const deadline = Date.now() + maxWaitMs;
    while (Date.now() < deadline) {
      const ok = await this.redis.set(key, '1', 'PX', minDelayMs, 'NX');
      if (ok === 'OK') return;
      const ttl = await this.redis.pttl(key);
      await sleep(Math.min(Math.max(ttl, 50), 2_000));
    }
  }

  /**
   * Claim one token from an hourly rate bucket (e.g. sends per SMTP account).
   * Returns false when the bucket is exhausted for the current hour — the
   * caller should defer the work instead of doing it now.
   */
  async takeHourlyToken(bucket: string, limit: number): Promise<boolean> {
    if (limit <= 0) return true;
    const hour = new Date().toISOString().slice(0, 13); // e.g. 2026-08-14T09
    const key = `rate:${bucket}:${hour}`;
    const count = await this.redis.incr(key);
    if (count === 1) await this.redis.expire(key, 3_900); // hour + slack
    if (count > limit) {
      await this.redis.decr(key); // not consumed — keep the count honest
      return false;
    }
    return true;
  }

  async ping(): Promise<boolean> {
    try {
      return (await this.redis.ping()) === 'PONG';
    } catch {
      return false;
    }
  }
}
