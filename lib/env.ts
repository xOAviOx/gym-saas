import 'server-only';

import { z } from 'zod';

/**
 * Server-only secrets. Imported by `instrumentation.ts` so the app refuses to
 * boot with a missing or malformed variable instead of failing on first use.
 */
const serverEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(20),
  NEXT_PUBLIC_APP_URL: z.url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(20),
  PORTAL_TOKEN_SECRET: z.string().min(32, 'PORTAL_TOKEN_SECRET must be at least 32 characters'),
  SECRETS_ENCRYPTION_KEY: z
    .string()
    .regex(
      /^[A-Za-z0-9+/]{43}=$/,
      'SECRETS_ENCRYPTION_KEY must be 32 random bytes encoded as base64',
    ),
  CRON_SECRET: z.string().min(32, 'CRON_SECRET must be at least 32 characters'),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

function loadServerEnv(): ServerEnv {
  const parsed = serverEnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const problems = parsed.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(
      `Invalid server environment:\n${problems}\nSee .env.example for every variable.`,
    );
  }
  return parsed.data;
}

export const env: ServerEnv = loadServerEnv();
