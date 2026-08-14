import * as Joi from 'joi';

/**
 * Startup validation schema for all environment variables. The app refuses to
 * boot if the environment is misconfigured. SMTP/LLM credentials are configured
 * in-app per user (see `smtp-accounts/`, `llm-accounts/`) — no secrets here.
 */
export const envValidationSchema = Joi.object({
  PORT: Joi.number().default(3000),

  // What this process does. Compose runs dedicated `api` and `worker` services
  // from the same image; `all` keeps single-process dev simple.
  APP_ROLE: Joi.string().valid('api', 'worker', 'all').default('all'),

  MONGO_URI: Joi.string().uri({ scheme: [/mongodb(\+srv)?/] }).required(),

  // Redis backs the BullMQ queues that distribute pipeline work and campaign
  // sends across every worker replica.
  REDIS_HOST: Joi.string().default('localhost'),
  REDIS_PORT: Joi.number().default(6379),

  // Optional label for this replica (compose sets it per service/replica).
  INSTANCE_ID: Joi.string().optional().allow(''),

  // Per-replica queue concurrency. Total parallelism ≈ replicas × these.
  SEND_CONCURRENCY: Joi.number().integer().min(1).max(500).default(3),
  PIPELINE_CONCURRENCY: Joi.number().integer().min(1).max(100).default(5),

  CORS_ORIGIN: Joi.string().default('*'),

  // At-rest encryption of user secrets (SMTP passwords, LLM API keys).
  // Optional in dev; set a long random string in production.
  ENCRYPTION_KEY: Joi.string().optional().allow(''),

  // AI (Google ADK) service. AI_WRITER_URL is the legacy name, still honored.
  AI_SERVICE_URL: Joi.string().uri().optional(),
  AI_WRITER_URL: Joi.string().uri().optional(),

  // Web scraping limits (politeness + safety).
  SCRAPE_TIMEOUT_MS: Joi.number().integer().min(1000).default(10_000),
  SCRAPE_MAX_PAGES_PER_SITE: Joi.number().integer().min(1).max(10).default(4),
  SCRAPE_MAX_BYTES: Joi.number().integer().min(100_000).default(1_500_000),
  SCRAPE_MIN_DOMAIN_DELAY_MS: Joi.number().integer().min(0).default(1_500),
  SCRAPE_CACHE_TTL_HOURS: Joi.number().integer().min(1).default(168),

  RESEARCH_CACHE_TTL_HOURS: Joi.number().integer().min(1).default(168),
  MAX_RIVALS: Joi.number().integer().min(1).max(5).default(3),

  // Deliverability: public origin for unsubscribe links, and a per-account
  // hourly send cap so campaigns drip instead of burst (0 = unlimited).
  PUBLIC_URL: Joi.string().uri().optional().allow(''),
  SEND_HOURLY_LIMIT: Joi.number().integer().min(0).default(80),
});
