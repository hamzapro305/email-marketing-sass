/**
 * Typed configuration accessors. `ConfigService.get<AppConfig>(...)` style is
 * avoided in favor of small, explicit keys read from the validated env.
 *
 * SMTP and LLM credentials are NOT configured via env — each user manages their
 * own accounts in-app (see `smtp-accounts/` and `llm-accounts/`).
 */
export type AppRole = 'api' | 'worker' | 'all';

export interface RedisConfig {
  host: string;
  port: number;
}

export interface ScrapeConfig {
  /** Hard timeout for a single page fetch. */
  timeoutMs: number;
  /** Max pages fetched per website (homepage + discovered key pages). */
  maxPagesPerSite: number;
  /** Max response bytes read per page. */
  maxBytes: number;
  /** Minimum delay between two fetches against the same domain (politeness). */
  minDomainDelayMs: number;
  /** How long a scraped page stays fresh in the cache. */
  cacheTtlHours: number;
}

export interface AppConfig {
  port: number;
  /**
   * What this process does: `api` serves HTTP only, `worker` consumes queues
   * only (still exposes /health), `all` does both (single-process dev).
   */
  role: AppRole;
  instanceId: string;
  mongoUri: string;
  redis: RedisConfig;
  /** Per-worker concurrency of the send queue. */
  sendConcurrency: number;
  /** Per-worker concurrency of the audit pipeline queue. */
  pipelineConcurrency: number;
  corsOrigin: string;
  /** Key for at-rest encryption of user secrets (SMTP passwords, API keys). */
  encryptionKey: string;
  /** Base URL of the AI (Google ADK) service. */
  aiServiceUrl: string;
  scrape: ScrapeConfig;
  /** How long a company research profile (per domain) stays fresh. */
  researchCacheTtlHours: number;
  /** How many rival companies to research per lead. */
  maxRivals: number;
  /** Public origin of the app (for unsubscribe links in emails). */
  publicUrl: string;
  /** Max emails per hour per SMTP account (0 = unlimited). Spam-filter safe. */
  sendHourlyLimit: number;
}

const int = (v: string | undefined, fallback: number): number => {
  const n = parseInt(v ?? '', 10);
  return Number.isFinite(n) ? n : fallback;
};

export default (): { app: AppConfig } => ({
  app: {
    port: int(process.env.PORT, 3000),
    role: (process.env.APP_ROLE as AppRole) ?? 'all',
    // Identifies which replica handled a job — surfaced in logs so the work
    // spreading across containers is visible.
    instanceId: process.env.INSTANCE_ID ?? process.env.HOSTNAME ?? 'backend',
    mongoUri: process.env.MONGO_URI as string,
    redis: {
      host: process.env.REDIS_HOST ?? 'localhost',
      port: int(process.env.REDIS_PORT, 6379),
    },
    sendConcurrency: int(process.env.SEND_CONCURRENCY, 3),
    pipelineConcurrency: int(process.env.PIPELINE_CONCURRENCY, 5),
    corsOrigin: process.env.CORS_ORIGIN ?? '*',
    encryptionKey: process.env.ENCRYPTION_KEY ?? '',
    aiServiceUrl:
      process.env.AI_SERVICE_URL ??
      process.env.AI_WRITER_URL ?? // legacy name, still honored
      'http://localhost:8000',
    scrape: {
      timeoutMs: int(process.env.SCRAPE_TIMEOUT_MS, 10_000),
      maxPagesPerSite: int(process.env.SCRAPE_MAX_PAGES_PER_SITE, 4),
      maxBytes: int(process.env.SCRAPE_MAX_BYTES, 1_500_000),
      minDomainDelayMs: int(process.env.SCRAPE_MIN_DOMAIN_DELAY_MS, 1_500),
      cacheTtlHours: int(process.env.SCRAPE_CACHE_TTL_HOURS, 168),
    },
    researchCacheTtlHours: int(process.env.RESEARCH_CACHE_TTL_HOURS, 168),
    maxRivals: int(process.env.MAX_RIVALS, 3),
    publicUrl: (process.env.PUBLIC_URL ?? '').replace(/\/$/, ''),
    sendHourlyLimit: int(process.env.SEND_HOURLY_LIMIT, 80),
  },
});
