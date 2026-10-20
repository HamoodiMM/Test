import { ApiError } from '@google/genai';
import type { ConfigService } from '@nestjs/config';
import { ChatService } from './chat.service.js';
import { ModelAvailabilityService, nextMidnightPacific } from './model-availability.service.js';
import type { ConversationsService } from '../conversations/conversations.service.js';
import type { Env } from '../config/env.validation.js';

const PRIMARY = 'gemini-3.5-flash';
const BACKUP_1 = 'gemini-3-flash-preview';
const BACKUP_2 = 'gemini-3.1-flash-lite';
const USER = { userId: 'u1', username: 'hamoodi' };

// Fake config: only the values ChatService and ModelAvailabilityService read
function fakeConfig(): ConfigService<Env, true> {
  const values: Record<string, unknown> = {
    GEMINI_API_KEY: 'test-key',
    GEMINI_MODEL: PRIMARY,
    GEMINI_FALLBACK_MODELS: [BACKUP_1, BACKUP_2],
    GEMINI_TIMEOUT_MS: 20_000,
    GEMINI_INPUT_PRICE_PER_MILLION: 0.3,
    GEMINI_OUTPUT_PRICE_PER_MILLION: 2.5,
  };
  return { get: (key: string) => values[key] } as unknown as ConfigService<Env, true>;
}

// Fake MongoDB layer: conversations live in memory
function fakeConversations() {
  return {
    findForUser: async () => null,
    create: async () => ({ _id: { toString: () => 'c1' }, title: 'test', messages: [], totalTokens: 0, totalCostUsd: 0 }),
    addExchange: async (conversation: { totalTokens: number; totalCostUsd: number }, _text: string, reply: { tokens: number; costUsd: number }) => {
      conversation.totalTokens += reply.tokens;
      conversation.totalCostUsd += reply.costUsd;
    },
  } as unknown as ConversationsService;
}

// What Google sends back for a used-up daily quota
function dailyQuotaError(retryDelaySeconds = 3600) {
  return new ApiError({
    status: 429,
    message: JSON.stringify({
      error: {
        code: 429,
        status: 'RESOURCE_EXHAUSTED',
        message: 'You exceeded your current quota',
        details: [
          { '@type': 'type.googleapis.com/google.rpc.QuotaFailure', violations: [{ quotaId: 'GenerateRequestsPerDayPerProjectPerModel-FreeTier', quotaValue: '20' }] },
          { '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: `${retryDelaySeconds}s` },
        ],
      },
    }),
  });
}

const overloadedError = () =>
  new ApiError({ status: 503, message: JSON.stringify({ error: { code: 503, status: 'UNAVAILABLE', message: 'high demand' } }) });

const ok = (text: string, model: string) => ({
  text,
  modelVersion: model,
  usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5, thoughtsTokenCount: 0, totalTokenCount: 15 },
});

describe('ChatService model fallback', () => {
  let models: ModelAvailabilityService;
  let service: ChatService;
  let generate: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    const config = fakeConfig();
    models = new ModelAvailabilityService(config);
    service = new ChatService(config, fakeConversations(), models);

    // Replace the real Gemini client with a fake we control
    generate = vi.fn();
    (service as unknown as { ai: unknown }).ai = { models: { generateContent: generate } };
  });

  afterEach(() => vi.restoreAllMocks());

  const askedModels = () => generate.mock.calls.map((call) => (call[0] as { model: string }).model);

  it('uses the main model when it works (no fallback info)', async () => {
    generate.mockResolvedValueOnce(ok('hi', PRIMARY));

    const reply = await service.sendMessage(USER, 'hello');

    expect(askedModels()).toEqual([PRIMARY]);
    expect(reply.fallback).toBeUndefined();
    expect(reply.primaryModel).toBe(PRIMARY);
  });

  it('switches to the next model when the main one hits its daily quota, and says so', async () => {
    generate.mockRejectedValueOnce(dailyQuotaError()).mockResolvedValueOnce(ok('hi from backup', BACKUP_1));

    const reply = await service.sendMessage(USER, 'hello');

    expect(askedModels()).toEqual([PRIMARY, BACKUP_1]);
    expect(reply.reply).toBe('hi from backup');
    expect(reply.fallback).toMatchObject({ from: PRIMARY, to: BACKUP_1, reason: 'AI_DAILY_QUOTA' });
    expect(reply.fallback!.message).toContain('reached its free daily limit');
    expect(reply.fallback!.primaryAvailableAgainAt).toBeDefined();
  });

  it('skips a model that is cooling down, instead of trying it again every time', async () => {
    generate.mockRejectedValueOnce(dailyQuotaError()).mockResolvedValue(ok('hi', BACKUP_1));

    await service.sendMessage(USER, 'first');
    generate.mockClear();
    const reply = await service.sendMessage(USER, 'second');

    expect(askedModels()).toEqual([BACKUP_1]); // primary not even tried
    expect(reply.fallback).toMatchObject({ from: PRIMARY, reason: 'AI_DAILY_QUOTA' });
  });

  it('goes back to the main model automatically when its limit resets', async () => {
    const start = Date.now();
    const clock = vi.spyOn(Date, 'now').mockReturnValue(start);

    generate.mockRejectedValueOnce(dailyQuotaError(60)).mockResolvedValueOnce(ok('backup', BACKUP_1));
    await service.sendMessage(USER, 'first');

    // 61 seconds later the quota has reset
    clock.mockReturnValue(start + 61_000);
    generate.mockClear();
    generate.mockResolvedValueOnce(ok('main again', PRIMARY));

    const reply = await service.sendMessage(USER, 'second');

    expect(askedModels()).toEqual([PRIMARY]);
    expect(reply.fallback).toBeUndefined();
    expect(reply.model).toBe(PRIMARY);
  });

  it('tries the second backup when the first one is overloaded too', async () => {
    generate
      .mockRejectedValueOnce(dailyQuotaError())
      .mockRejectedValueOnce(overloadedError())
      .mockResolvedValueOnce(ok('hi', BACKUP_2));

    const reply = await service.sendMessage(USER, 'hello');

    expect(askedModels()).toEqual([PRIMARY, BACKUP_1, BACKUP_2]);
    expect(reply.fallback).toMatchObject({ from: PRIMARY, to: BACKUP_2, reason: 'AI_DAILY_QUOTA' });
  });

  it('does NOT fall back on configuration errors (another model would not fix a bad key)', async () => {
    generate.mockRejectedValueOnce(new ApiError({ status: 404, message: '{"error":{"code":404,"status":"NOT_FOUND"}}' }));

    await expect(service.sendMessage(USER, 'hello')).rejects.toMatchObject({ code: 'AI_MISCONFIGURED' });
    expect(askedModels()).toEqual([PRIMARY]);
  });

  it('reports every model it tried when all of them fail', async () => {
    generate.mockRejectedValue(overloadedError());

    await expect(service.sendMessage(USER, 'hello')).rejects.toMatchObject({
      code: 'AI_OVERLOADED',
      extra: { details: { triedModels: [`${PRIMARY} (AI_OVERLOADED)`, `${BACKUP_1} (AI_OVERLOADED)`, `${BACKUP_2} (AI_OVERLOADED)`] } },
    });
  });

  it('calculates the cost with the price of the model that answered', async () => {
    // gemini-3-flash-preview: $0.50 in / $3.00 out per 1M tokens → 10 × 0.5/1M + 5 × 3/1M
    generate.mockRejectedValueOnce(dailyQuotaError()).mockResolvedValueOnce(ok('hi', BACKUP_1));

    const reply = await service.sendMessage(USER, 'hello');

    expect(reply.usage.costUsd).toBeCloseTo(0.00002, 8);
  });
});

describe('nextMidnightPacific', () => {
  it('returns a time within the next 24 hours', () => {
    const now = Date.now();
    const midnight = nextMidnightPacific(now);

    expect(midnight).toBeGreaterThan(now);
    expect(midnight - now).toBeLessThanOrEqual(24 * 3600 * 1000);
  });
});
