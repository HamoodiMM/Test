import { z } from 'zod';

// Every environment variable the app needs, with its rules.
// Validated once at startup: the app refuses to start with missing or invalid settings.
const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),

  // users, guest requests and conversations all live in this database
  MONGODB_URI: z
    .string({ error: 'MONGODB_URI is required' })
    .min(1, 'MONGODB_URI is required'),

  // Signs and verifies login tokens (JWTs). Long and random; never commit it.
  JWT_SECRET: z
    .string({ error: 'JWT_SECRET is required' })
    .min(32, 'JWT_SECRET must be at least 32 characters'),

  GEMINI_API_KEY: z
    .string({ error: 'GEMINI_API_KEY is required' })
    .min(1, 'GEMINI_API_KEY is required'),

  GEMINI_MODEL: z.string().min(1).default('gemini-3.5-flash-lite'),

  // Backup models, tried in order when GEMINI_MODEL hits a quota, is overloaded or times out.
  // Comma-separated in .env, e.g. "gemini-3.5-flash,gemini-3.1-flash-lite"; turned into an array here.
  GEMINI_FALLBACK_MODELS: z
    .string()
    .default('')
    .transform((list) =>
      list
        .split(',')
        .map((model) => model.trim())
        .filter((model) => model.length > 0),
    ),

  // How long to wait for Gemini before giving up (then the user gets a 504 AI_TIMEOUT)
  GEMINI_TIMEOUT_MS: z.coerce.number().int().positive().default(20_000),

  // Paid-tier prices (USD per 1 million tokens), used to show what each message would cost.
  // Output price includes thinking tokens.
  GEMINI_INPUT_PRICE_PER_MILLION: z.coerce.number().nonnegative().default(0.3),
  GEMINI_OUTPUT_PRICE_PER_MILLION: z.coerce.number().nonnegative().default(2.5),
});

// The TypeScript type of our validated config, generated from the schema
export type Env = z.infer<typeof envSchema>;

// Called once by ConfigModule at startup. Throwing here stops the app with a clear message.
export function validateEnv(config: Record<string, unknown>): Env {
  const result = envSchema.safeParse(config);

  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');

    throw new Error(`Invalid environment variables:\n${details}`);
  }

  return result.data;
}
