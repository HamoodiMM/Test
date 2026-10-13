import { z } from 'zod';

// Every environment variable the chatbot needs, with its rules.
// Same idea as the Zod request schemas in the Express app, applied to configuration.
const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3001),

  GEMINI_API_KEY: z
    .string({ error: 'GEMINI_API_KEY is required' })
    .min(1, 'GEMINI_API_KEY is required'),

  GEMINI_MODEL: z.string().min(1).default('gemini-3.5-flash-lite'),

  // The website allowed to call this API from a browser (the Express frontend)
  CORS_ORIGIN: z.url({ error: 'CORS_ORIGIN must be a URL' }).default('http://localhost:3000'),

  // How long to wait for Gemini before giving up
  GEMINI_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),

  // Same database as the Express app: conversations are stored next to users
  MONGODB_URI: z
    .string({ error: 'MONGODB_URI is required' })
    .min(1, 'MONGODB_URI is required'),

  // Must be the SAME secret as the Express app, so we can verify the tokens it issues
  JWT_SECRET: z
    .string({ error: 'JWT_SECRET is required' })
    .min(32, 'JWT_SECRET must be at least 32 characters'),

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
