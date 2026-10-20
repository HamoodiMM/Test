import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiError, GoogleGenAI } from '@google/genai';
import type { Content, GenerateContentResponse } from '@google/genai';
import type { Env } from '../config/env.validation.js';
import type { AuthUser } from '../auth/auth.types.js';
import { ConversationsService } from '../conversations/conversations.service.js';
import { AppException } from '../common/app.exception.js';
import type { ErrorCode } from '../common/app.exception.js';
import { ModelAvailabilityService } from './model-availability.service.js';
import type { UnavailableReason } from './model-availability.service.js';
import { priceFor } from './model-pricing.js';
import type { ModelPrice } from './model-pricing.js';

// How many tokens one request used. Free-tier limits and pricing are counted in tokens.
export interface TokenUsage {
  inputTokens: number; // your message + history + system instruction
  outputTokens: number; // the reply text
  thinkingTokens: number; // internal "reasoning" some models do before answering
  totalTokens: number;
  costUsd: number; // what this request would cost on the paid tier
}

// Present when the reply did NOT come from the main model
export interface FallbackInfo {
  from: string; // the main model (GEMINI_MODEL)
  to: string; // the model that actually answered
  reason: UnavailableReason; // why the main model was skipped
  message: string; // ready-to-show explanation for the user
  primaryAvailableAgainAt?: string; // ISO time when the main model will be tried again
}

export interface ChatReply {
  conversationId: string;
  title: string;
  reply: string;
  model: string; // the exact model version that answered
  primaryModel: string; // GEMINI_MODEL, so the UI can tell when we're back on it
  fallback?: FallbackInfo;
  usage: TokenUsage;
  conversationTotals: { tokens: number; costUsd: number };
}

// How many earlier messages we send to Gemini as context (10 exchanges).
// The full conversation stays in MongoDB; this only limits what Gemini re-reads,
// because every message of history costs input tokens on EVERY request.
const MAX_CONTEXT_MESSAGES = 20;

// Errors that mean "this model can't answer right now, but another one might"
const FALLBACK_REASONS: ErrorCode[] = ['AI_DAILY_QUOTA', 'AI_RATE_LIMITED', 'AI_OVERLOADED', 'AI_TIMEOUT'];

const REASON_TEXT: Record<UnavailableReason, string> = {
  AI_DAILY_QUOTA: 'reached its free daily limit',
  AI_RATE_LIMITED: 'reached its usage limit',
  AI_OVERLOADED: 'is overloaded right now',
  AI_TIMEOUT: 'did not answer in time',
};

// What Google puts inside a failed response (parsed from ApiError.message)
interface GoogleErrorBody {
  error?: {
    code?: number;
    status?: string; // e.g. "RESOURCE_EXHAUSTED", "UNAVAILABLE"
    message?: string;
    details?: Array<{
      '@type'?: string;
      retryDelay?: string; // e.g. "44412s"
      violations?: Array<{ quotaId?: string; quotaValue?: string }>;
    }>;
  };
}

// The result of one successful Gemini call
interface Generation {
  model: string; // the model we asked for
  response: GenerateContentResponse;
  fallback?: FallbackInfo;
}

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);
  private readonly ai: GoogleGenAI;
  private readonly timeoutMs: number;
  private readonly defaultPrice: ModelPrice;

  // Dependency injection: Nest passes in ConfigService (global), ConversationsService
  // (exported by ConversationsModule) and ModelAvailabilityService (provided by ChatModule)
  constructor(
    config: ConfigService<Env, true>,
    private readonly conversationsService: ConversationsService,
    private readonly models: ModelAvailabilityService,
  ) {
    this.timeoutMs = config.get('GEMINI_TIMEOUT_MS', { infer: true });

    // The API key identifies OUR app to Google. It's sent with every request to Gemini.
    this.ai = new GoogleGenAI({
      apiKey: config.get('GEMINI_API_KEY', { infer: true }),
      // Never wait forever on an external API
      httpOptions: { timeout: this.timeoutMs },
    });
    this.defaultPrice = {
      inputPerMillion: config.get('GEMINI_INPUT_PRICE_PER_MILLION', { infer: true }),
      outputPerMillion: config.get('GEMINI_OUTPUT_PRICE_PER_MILLION', { infer: true }),
    };
  }

  async sendMessage(user: AuthUser, message: string, conversationId?: string): Promise<ChatReply> {
    // 1. Load the existing conversation (only if it belongs to this user)
    const existing = conversationId
      ? await this.conversationsService.findForUser(conversationId, user.userId)
      : null;

    // 2. The Gemini API is STATELESS: it remembers nothing between requests.
    //    So we send the recent history (from MongoDB) + the new message every time.
    const history = existing ? existing.messages.slice(-MAX_CONTEXT_MESSAGES) : [];

    const contents: Content[] = [
      ...history.map((m) => ({ role: m.role, parts: [{ text: m.text }] })),
      { role: 'user', parts: [{ text: message }] },
    ];

    // 3. Call Gemini, falling back to backup models if the main one can't answer
    const { model, response, fallback } = await this.generateWithFallback(contents, user);

    // 4. Count tokens and calculate the cost with the price of the model that answered
    const usage = this.calculateUsage(response, model);

    // 5. Save the exchange. A new conversation is only created AFTER Gemini answered,
    //    so failed requests don't leave empty chats behind.
    const conversation = existing ?? (await this.conversationsService.create(user.userId, message));
    const answeredBy = response.modelVersion ?? model;

    await this.conversationsService.addExchange(conversation, message, {
      text: response.text!,
      tokens: usage.totalTokens,
      costUsd: usage.costUsd,
      model: answeredBy,
    });

    return {
      conversationId: conversation._id.toString(),
      title: conversation.title,
      reply: response.text!,
      model: answeredBy,
      primaryModel: this.models.primaryModel,
      fallback,
      usage,
      conversationTotals: {
        tokens: conversation.totalTokens,
        costUsd: conversation.totalCostUsd,
      },
    };
  }

  // Try the models in order (main model first, unless it's cooling down).
  // - Quota / overload / timeout → put that model on cooldown and try the next one.
  // - Any other error (bad key, blocked message...) → stop: another model won't fix it.
  // - All models failed → throw the last error, listing every model that was tried.
  private async generateWithFallback(contents: Content[], user: AuthUser): Promise<Generation> {
    const primary = this.models.primaryModel;
    const failures: Array<{ model: string; code: ErrorCode }> = [];
    let lastError: AppException | undefined;

    for (const model of this.models.candidates()) {
      try {
        const response = await this.generateOnce(model, contents, user);

        if (model === primary) {
          return { model, response };
        }

        // A backup model answered: explain why, so the user knows what happened
        const primaryFailure = failures.find((f) => f.model === primary);
        // Either it failed just now, or it was skipped because it's still cooling down
        const reason = (primaryFailure?.code as UnavailableReason) ?? this.models.reasonFor(primary) ?? 'AI_OVERLOADED';
        const availableAgainAt = this.models.availableAgainAt(primary);
        this.logger.warn(`Answered with fallback model "${model}" because "${primary}" ${REASON_TEXT[reason]}`);

        return {
          model,
          response,
          fallback: {
            from: primary,
            to: model,
            reason,
            message: `${primary} ${REASON_TEXT[reason]}, so this answer came from ${model}.`,
            primaryAvailableAgainAt: availableAgainAt?.toISOString(),
          },
        };
      } catch (error) {
        if (!(error instanceof AppException) || !FALLBACK_REASONS.includes(error.code)) {
          throw error;
        }

        const retryAfter = error.extra.details?.retryAfterSeconds;
        this.models.markUnavailable(model, error.code as UnavailableReason, typeof retryAfter === 'number' ? retryAfter : undefined);
        failures.push({ model, code: error.code });
        lastError = error;
      }
    }

    // Every model failed: report the last error, plus what was tried
    const tried = failures.map((f) => `${f.model} (${f.code})`);
    throw new AppException(lastError!.getStatus(), lastError!.code, lastError!.message, {
      ...lastError!.extra,
      hint:
        failures.length > 1
          ? `All ${failures.length} configured models are unavailable right now. Try again later.`
          : lastError!.extra.hint,
      details: { ...lastError!.extra.details, triedModels: tried },
    });
  }

  // Instructions the model follows for every message (the user never sees this).
  // It includes the username from the JWT, so the assistant can address the user personally.
  private systemInstruction(user: AuthUser): string {
    return (
      'You are a friendly, concise assistant inside "My Auth App", a student backend project. ' +
      `You are talking to a logged-in user named "${user.username}". ` +
      'Answer clearly in a few short paragraphs at most. Use Markdown for code.'
    );
  }

  // One attempt with one model
  private async generateOnce(model: string, contents: Content[], user: AuthUser): Promise<GenerateContentResponse> {
    let response: GenerateContentResponse;
    const startedAt = Date.now();

    try {
      // One HTTPS request to Google's Gemini API
      response = await this.ai.models.generateContent({
        model,
        contents,
        config: { systemInstruction: this.systemInstruction(user) },
      });
    } catch (error) {
      throw this.toAppException(error, model, Date.now() - startedAt);
    }

    // Gemini can refuse to answer (e.g. safety filters), which gives an empty reply
    if (!response.text) {
      const blockReason = response.promptFeedback?.blockReason;
      const finishReason = response.candidates?.[0]?.finishReason;
      this.logger.warn(`Gemini returned no text (blockReason: ${blockReason ?? 'none'}, finishReason: ${finishReason ?? 'none'})`);

      if (blockReason) {
        throw new AppException(HttpStatus.BAD_REQUEST, 'AI_BLOCKED', 'Your message was blocked by the AI safety filters', {
          hint: 'Rephrase your message and try again.',
          details: { model, blockReason },
        });
      }
      throw new AppException(HttpStatus.BAD_GATEWAY, 'AI_EMPTY_REPLY', 'The AI service returned an empty answer', {
        hint: 'This is usually temporary. Try sending the message again.',
        retryable: true,
        details: { model, finishReason },
      });
    }

    return response;
  }

  // Price = tokens / 1,000,000 × price per million (of the model that answered).
  // Thinking tokens are billed at the OUTPUT price, like the visible answer.
  private calculateUsage(response: GenerateContentResponse, model: string): TokenUsage {
    const price = priceFor(model, this.defaultPrice);
    const meta = response.usageMetadata;
    const inputTokens = meta?.promptTokenCount ?? 0;
    const outputTokens = meta?.candidatesTokenCount ?? 0;
    const thinkingTokens = meta?.thoughtsTokenCount ?? 0;

    const rawCost =
      (inputTokens / 1_000_000) * price.inputPerMillion +
      ((outputTokens + thinkingTokens) / 1_000_000) * price.outputPerMillion;

    // Round to 8 decimals to hide floating-point noise like 0.0012645000000000002
    const costUsd = Math.round(rawCost * 1e8) / 1e8;

    return {
      inputTokens,
      outputTokens,
      thinkingTokens,
      totalTokens: meta?.totalTokenCount ?? inputTokens + outputTokens + thinkingTokens,
      costUsd,
    };
  }

  // Translate a Gemini failure into a detailed error for OUR client.
  // Google's full message goes to the server log; the client gets facts it can act on,
  // but never anything about our API key.
  private toAppException(error: unknown, model: string, elapsedMs: number): AppException {
    if (error instanceof ApiError) {
      const google = this.parseGoogleError(error.message);
      const providerStatus = google.error?.status ?? String(error.status);
      this.logger.error(`Gemini API error ${error.status} ${providerStatus} for "${model}" after ${elapsedMs}ms: ${google.error?.message ?? error.message}`);

      const details = google.error?.details ?? [];
      const quotaId = details.flatMap((d) => d.violations ?? []).find((v) => v.quotaId)?.quotaId;
      const quotaLimit = details.flatMap((d) => d.violations ?? []).find((v) => v.quotaValue)?.quotaValue;
      const retryDelay = details.find((d) => d.retryDelay)?.retryDelay;
      const retryAfterSeconds = retryDelay ? Math.ceil(parseFloat(retryDelay)) : undefined;

      // 429 = our API key used up a quota. Which one? Google's quotaId tells us.
      if (error.status === 429) {
        if (quotaId && /PerDay/i.test(quotaId)) {
          return new AppException(
            HttpStatus.SERVICE_UNAVAILABLE,
            'AI_DAILY_QUOTA',
            `The free daily limit for the AI model "${model}" has been reached`,
            {
              hint:
                'Each model allows a limited number of requests per day on the free tier. ' +
                'It resets at midnight Pacific time, or add more models to GEMINI_FALLBACK_MODELS.',
              details: { model, quota: quotaId, limit: quotaLimit, providerStatus, retryAfterSeconds },
            },
          );
        }
        return new AppException(
          HttpStatus.SERVICE_UNAVAILABLE,
          'AI_RATE_LIMITED',
          `The AI model "${model}" is receiving too many requests from this app`,
          {
            hint: 'This is a per-minute limit. Wait a moment and try again.',
            retryable: true,
            details: { model, quota: quotaId, limit: quotaLimit, providerStatus, retryAfterSeconds },
          },
        );
      }

      // 5xx = Google's side. 503 UNAVAILABLE usually means "high demand".
      if (error.status >= 500) {
        return new AppException(
          HttpStatus.SERVICE_UNAVAILABLE,
          'AI_OVERLOADED',
          `The AI model "${model}" is currently overloaded or unavailable`,
          {
            hint: "This is on Google's side and usually temporary. Try again in a minute.",
            retryable: true,
            details: { model, providerStatusCode: error.status, providerStatus, elapsedMs },
          },
        );
      }

      // 400 / 401 / 403 / 404: invalid key, unknown model... our configuration is wrong
      return new AppException(
        HttpStatus.INTERNAL_SERVER_ERROR,
        'AI_MISCONFIGURED',
        'The chatbot is not configured correctly',
        {
          hint:
            error.status === 404
              ? `The model "${model}" does not exist or is not available to this API key. Check GEMINI_MODEL and GEMINI_FALLBACK_MODELS.`
              : 'Check GEMINI_API_KEY and GEMINI_MODEL in the server .env (details are in the server log).',
          details: { model, providerStatusCode: error.status, providerStatus },
        },
      );
    }

    // The request took longer than GEMINI_TIMEOUT_MS and was cancelled
    if (error instanceof Error && (error.name === 'AbortError' || /abort|timeout/i.test(error.message))) {
      this.logger.error(`Gemini request to "${model}" timed out after ${elapsedMs}ms: ${error.message}`);
      return new AppException(
        HttpStatus.GATEWAY_TIMEOUT,
        'AI_TIMEOUT',
        `The AI model "${model}" did not answer within ${this.timeoutLabel()}`,
        {
          hint: 'Google may be slow right now. Try again, or ask a shorter question.',
          retryable: true,
          details: { model, timeoutSeconds: this.timeoutMs / 1000, elapsedMs },
        },
      );
    }

    // Network failure (no internet, DNS, firewall) or anything unexpected
    this.logger.error('Unexpected error calling Gemini', error instanceof Error ? error.stack : String(error));
    return new AppException(HttpStatus.BAD_GATEWAY, 'AI_UNREACHABLE', 'Could not reach the AI service', {
      hint: "The server could not connect to Google's API. Check the server's internet connection.",
      retryable: true,
      details: { model, reason: error instanceof Error ? error.message : String(error) },
    });
  }

  // "20 seconds" (or "500 ms" for very short test timeouts)
  private timeoutLabel(): string {
    return this.timeoutMs < 1000 ? `${this.timeoutMs} ms` : `${Math.round(this.timeoutMs / 1000)} seconds`;
  }

  // ApiError.message contains Google's JSON response body; parse it if possible
  private parseGoogleError(message: string): GoogleErrorBody {
    try {
      const start = message.indexOf('{');
      return start >= 0 ? (JSON.parse(message.slice(start)) as GoogleErrorBody) : {};
    } catch {
      return {};
    }
  }
}
