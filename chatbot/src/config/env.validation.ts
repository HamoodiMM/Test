import { z } from 'zod';

// Every environment variable the chatbot needs, with its rules.
// Same idea as the Zod request schemas in the Express app, applied to configuration.
const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3001),

  GEMINI_API_KEY: z
    .string({ error: 'GEMINI_API_KEY is required' })
    .min(1, 'GEMINI_API_KEY is required'),

  GEMINI_MODEL: z.string().min(1).default('gemini-flash-latest'),
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
