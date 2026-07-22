/**
 * Typed configuration accessors. `ConfigService.get<AppConfig>(...)` style is
 * avoided in favor of small, explicit keys read from the validated env.
 */
export type EmailMode = 'demo' | 'live';

export interface SmtpConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from: string;
}

export interface AppConfig {
  port: number;
  mongoUri: string;
  emailMode: EmailMode;
  sendConcurrency: number;
  corsOrigin: string;
  smtp: SmtpConfig;
}

export default (): { app: AppConfig } => ({
  app: {
    port: parseInt(process.env.PORT ?? '3000', 10),
    mongoUri: process.env.MONGO_URI as string,
    emailMode: (process.env.EMAIL_MODE as EmailMode) ?? 'demo',
    sendConcurrency: parseInt(process.env.SEND_CONCURRENCY ?? '3', 10),
    corsOrigin: process.env.CORS_ORIGIN ?? '*',
    smtp: {
      host: process.env.SMTP_HOST ?? '',
      port: parseInt(process.env.SMTP_PORT ?? '587', 10),
      secure: String(process.env.SMTP_SECURE).toLowerCase() === 'true',
      user: process.env.SMTP_USER ?? '',
      pass: process.env.SMTP_PASS ?? '',
      from: process.env.SMTP_FROM ?? '',
    },
  },
});
