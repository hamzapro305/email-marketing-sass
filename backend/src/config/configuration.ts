/**
 * Typed configuration accessors. `ConfigService.get<AppConfig>(...)` style is
 * avoided in favor of small, explicit keys read from the validated env.
 *
 * SMTP is no longer configured via env — each user manages their own SMTP
 * accounts in-app (see `smtp-accounts/`).
 */
export interface RedisConfig {
  host: string;
  port: number;
}

export interface AppConfig {
  port: number;
  instanceId: string;
  mongoUri: string;
  redis: RedisConfig;
  sendConcurrency: number;
  corsOrigin: string;
  /** Base URL of the Google ADK email-writer sidecar. */
  aiWriterUrl: string;
}

export default (): { app: AppConfig } => ({
  app: {
    port: parseInt(process.env.PORT ?? '3000', 10),
    // Identifies which backend replica handled a job — surfaced in logs so you
    // can *see* the work being spread across containers behind nginx.
    instanceId: process.env.INSTANCE_ID ?? process.env.HOSTNAME ?? 'backend',
    mongoUri: process.env.MONGO_URI as string,
    redis: {
      host: process.env.REDIS_HOST ?? 'localhost',
      port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
    },
    sendConcurrency: parseInt(process.env.SEND_CONCURRENCY ?? '3', 10),
    corsOrigin: process.env.CORS_ORIGIN ?? '*',
    aiWriterUrl: process.env.AI_WRITER_URL ?? 'http://localhost:8000',
  },
});
