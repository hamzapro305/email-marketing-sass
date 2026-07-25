import * as Joi from 'joi';

/**
 * Startup validation schema for all environment variables. The app refuses to
 * boot if the environment is misconfigured. SMTP is configured in-app per user
 * (see `smtp-accounts/`), so there are no SMTP_* env vars.
 */
export const envValidationSchema = Joi.object({
  PORT: Joi.number().default(3000),

  MONGO_URI: Joi.string().uri({ scheme: [/mongodb(\+srv)?/] }).required(),

  // Redis backs the BullMQ job queue that distributes campaign sends across
  // every backend replica. Required so the queue can be shared.
  REDIS_HOST: Joi.string().default('localhost'),
  REDIS_PORT: Joi.number().default(6379),

  // Optional label for this replica (compose sets it per service/replica).
  INSTANCE_ID: Joi.string().optional().allow(''),

  // Per-replica worker concurrency. Total parallelism ≈ replicas × this value.
  SEND_CONCURRENCY: Joi.number().integer().min(1).max(500).default(3),

  CORS_ORIGIN: Joi.string().default('*'),

  // Google ADK email-writer sidecar.
  AI_WRITER_URL: Joi.string().uri().default('http://localhost:8000'),
});
