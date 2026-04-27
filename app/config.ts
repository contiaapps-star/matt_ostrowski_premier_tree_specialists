import { config as loadEnv } from 'dotenv';
import { z } from 'zod';

if (process.env.NODE_ENV !== 'production') {
  loadEnv();
}

const booleanString = z
  .union([z.boolean(), z.string()])
  .transform((value) => {
    if (typeof value === 'boolean') return value;
    return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
  });

const ConfigSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().nonnegative().default(5000),
    SESSION_SECRET: z.string().min(1).optional(),
    INTEGRATION_MODE: z.enum(['stub', 'live']).default('stub'),

    DATABASE_PATH: z.string().min(1).default('/data/leads.db'),

    OPENROUTER_API_KEY: z.string().optional().default(''),
    OPENROUTER_MODEL: z.string().default('anthropic/claude-sonnet-4-6'),
    OPENROUTER_BASE_URL: z.string().url().default('https://openrouter.ai/api/v1'),

    CONFIDENCE_AUTO_SEND_THRESHOLD: z.coerce.number().min(0).max(1).default(0.8),
    CONFIDENCE_DRAFT_THRESHOLD: z.coerce.number().min(0).max(1).default(0.5),

    SENDGRID_API_KEY: z.string().optional().default(''),
    EMAIL_FROM_ADDRESS: z.string().default('info@premiertreesllc.com'),
    EMAIL_FROM_NAME: z.string().default('Premier Tree Specialists'),

    AGENT_PHONE_API_KEY: z.string().optional().default(''),
    AGENT_PHONE_NUMBER: z.string().optional().default(''),
    SMS_PROVIDER: z.enum(['agent_phone', 'twilio']).default('agent_phone'),
    ENABLE_IMESSAGE: booleanString.default(true),

    ARBOSTAR_COMPANY_ID: z.string().optional().default(''),
    ARBOSTAR_API_KEY: z.string().optional().default(''),

    GMAIL_INBOUND_ADDRESS: z.string().optional().default(''),
    GMAIL_OAUTH_REFRESH_TOKEN: z.string().optional().default(''),
    LSA_EMAIL_FROM: z.string().default('noreply@google-business.com'),
    ANSWERFORCE_EMAIL_FROM: z.string().default('notifications@answerforce.com'),
    EMAIL_POLL_INTERVAL_SECONDS: z.coerce.number().int().positive().default(60),

    WEBSITE_FORM_WEBHOOK_SECRET: z.string().optional().default(''),
  })
  .superRefine((value, ctx) => {
    if (value.NODE_ENV === 'production') {
      if (!value.SESSION_SECRET || value.SESSION_SECRET.length < 16) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['SESSION_SECRET'],
          message:
            'SESSION_SECRET is required in production and must be at least 16 characters long',
        });
      }
    }
  });

export type Config = z.infer<typeof ConfigSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = ConfigSchema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return parsed.data;
}

export const config: Config = loadConfig();
