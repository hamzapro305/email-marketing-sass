import * as Joi from 'joi';

/**
 * Startup validation schema for all environment variables.
 * The app refuses to boot if the environment is misconfigured, and
 * SMTP_* fields become required only when EMAIL_MODE=live.
 */
export const envValidationSchema = Joi.object({
  PORT: Joi.number().default(3000),

  MONGO_URI: Joi.string().uri({ scheme: [/mongodb(\+srv)?/] }).required(),

  EMAIL_MODE: Joi.string().valid('demo', 'live').default('demo'),

  SEND_CONCURRENCY: Joi.number().integer().min(1).max(50).default(3),

  CORS_ORIGIN: Joi.string().default('*'),

  // SMTP settings — required only in live mode.
  SMTP_HOST: Joi.string().when('EMAIL_MODE', {
    is: 'live',
    then: Joi.required(),
    otherwise: Joi.optional().allow(''),
  }),
  SMTP_PORT: Joi.number().when('EMAIL_MODE', {
    is: 'live',
    then: Joi.required(),
    otherwise: Joi.optional().allow(''),
  }),
  SMTP_SECURE: Joi.boolean().truthy('true').falsy('false').default(false),
  SMTP_USER: Joi.string().when('EMAIL_MODE', {
    is: 'live',
    then: Joi.required(),
    otherwise: Joi.optional().allow(''),
  }),
  SMTP_PASS: Joi.string().when('EMAIL_MODE', {
    is: 'live',
    then: Joi.required(),
    otherwise: Joi.optional().allow(''),
  }),
  SMTP_FROM: Joi.string().when('EMAIL_MODE', {
    is: 'live',
    then: Joi.required(),
    otherwise: Joi.optional().allow(''),
  }),
});
