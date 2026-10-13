import {
  BadGatewayException,
  BadRequestException,
  GatewayTimeoutException,
  Injectable,
  InternalServerErrorException,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiError, GoogleGenAI } from '@google/genai';
import type { Content, GenerateContentResponse } from '@google/genai';
import type { Env } from '../config/env.validation.js';
import type { AuthUser } from '../auth/auth.types.js';
import { ConversationsService } from '../conversations/conversations.service.js';

// How many tokens one request used. Free-tier limits and pricing are counted in tokens.
export interface TokenUsage {
  inputTokens: number; // your message + history + system instruction
  outputTokens: number; // the reply text
  thinkingTokens: number; // internal "reasoning" some models do before answering
  totalTokens: number;
  costUsd: number; // what this request would cost on the paid tier
}

export interface ChatReply {
  conversationId: string;
  title: string;
  reply: string;
  model: string;
  usage: TokenUsage;
  conversationTotals: { tokens: number; costUsd: number };
}

// How many earlier messages we send to Gemini as context (10 exchanges).
// The full conversation stays in MongoDB; this only limits what Gemini re-reads,
// because every message of history costs input tokens on EVERY request.
const MAX_CONTEXT_MESSAGES = 20;

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);
  private readonly ai: GoogleGenAI;
  private readonly model: string;
  private readonly inputPricePerMillion: number;
  private readonly outputPricePerMillion: number;

  // Dependency injection: Nest passes in ConfigService (global) and
  // ConversationsService (exported by ConversationsModule, which ChatModule imports)
  constructor(
    config: ConfigService<Env, true>,
    private readonly conversationsService: ConversationsService,
  ) {
    // The API key identifies OUR app to Google. It's sent with every request to Gemini.
    this.ai = new GoogleGenAI({
      apiKey: config.get('GEMINI_API_KEY', { infer: true }),
      // Never wait forever on an external API
      httpOptions: { timeout: config.get('GEMINI_TIMEOUT_MS', { infer: true }) },
    });
    this.model = config.get('GEMINI_MODEL', { infer: true });
    this.inputPricePerMillion = config.get('GEMINI_INPUT_PRICE_PER_MILLION', { infer: true });
    this.outputPricePerMillion = config.get('GEMINI_OUTPUT_PRICE_PER_MILLION', { infer: true });
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

    // 3. Call Gemini
    const response = await this.generate(contents, user);

    // 4. Count tokens and calculate the cost
    const usage = this.calculateUsage(response);

    // 5. Save the exchange. A new conversation is only created AFTER Gemini answered,
    //    so failed requests don't leave empty chats behind.
    const conversation = existing ?? (await this.conversationsService.create(user.userId, message));

    await this.conversationsService.addExchange(conversation, message, {
      text: response.text!,
      tokens: usage.totalTokens,
      costUsd: usage.costUsd,
    });

    return {
      conversationId: conversation._id.toString(),
      title: conversation.title,
      reply: response.text!,
      model: response.modelVersion ?? this.model,
      usage,
      conversationTotals: {
        tokens: conversation.totalTokens,
        costUsd: conversation.totalCostUsd,
      },
    };
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

  private async generate(contents: Content[], user: AuthUser): Promise<GenerateContentResponse> {
    let response: GenerateContentResponse;

    try {
      // One HTTPS request to Google's Gemini API
      response = await this.ai.models.generateContent({
        model: this.model,
        contents,
        config: { systemInstruction: this.systemInstruction(user) },
      });
    } catch (error) {
      throw this.toHttpException(error);
    }

    // Gemini can refuse to answer (e.g. safety filters), which gives an empty reply
    if (!response.text) {
      const blockReason = response.promptFeedback?.blockReason;
      this.logger.warn(`Gemini returned no text (blockReason: ${blockReason ?? 'none'})`);

      if (blockReason) {
        throw new BadRequestException('Your message was blocked by the AI safety filters');
      }
      throw new BadGatewayException('The AI service returned an empty answer, please try again');
    }

    return response;
  }

  // Price = tokens / 1,000,000 × price per million.
  // Thinking tokens are billed at the OUTPUT price, like the visible answer.
  private calculateUsage(response: GenerateContentResponse): TokenUsage {
    const meta = response.usageMetadata;
    const inputTokens = meta?.promptTokenCount ?? 0;
    const outputTokens = meta?.candidatesTokenCount ?? 0;
    const thinkingTokens = meta?.thoughtsTokenCount ?? 0;

    const rawCost =
      (inputTokens / 1_000_000) * this.inputPricePerMillion +
      ((outputTokens + thinkingTokens) / 1_000_000) * this.outputPricePerMillion;

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

  // Translate a Gemini failure into an HTTP error for OUR client.
  // Full details go to the server log; the client gets a safe, useful message.
  private toHttpException(error: unknown): Error {
    if (error instanceof ApiError) {
      this.logger.error(`Gemini API error ${error.status}: ${error.message}`);

      // Rate limit / quota exhausted on our API key. Google's message says which limit:
      // a per-DAY quota (free tier: resets at midnight Pacific time) or a per-minute one.
      if (error.status === 429) {
        if (/PerDay/i.test(error.message)) {
          return new ServiceUnavailableException(
            "The AI assistant's free daily limit has been reached. It resets at midnight Pacific time - please try again later.",
          );
        }
        return new ServiceUnavailableException(
          'The AI service is receiving too many requests, please try again in a minute',
        );
      }

      // Google's side is overloaded or broken
      if (error.status >= 500) {
        return new ServiceUnavailableException(
          'The AI service is temporarily unavailable, please try again later',
        );
      }

      // 400/401/403/404: invalid key, wrong model name... our configuration is wrong.
      // Don't tell the client details about our API key.
      return new InternalServerErrorException('The chatbot is not configured correctly');
    }

    // The request took longer than GEMINI_TIMEOUT_MS and was cancelled
    if (error instanceof Error && (error.name === 'AbortError' || /abort|timeout/i.test(error.message))) {
      this.logger.error(`Gemini request timed out: ${error.message}`);
      return new GatewayTimeoutException('The AI service took too long to respond');
    }

    // Network failure or anything unexpected
    this.logger.error('Unexpected error calling Gemini', error instanceof Error ? error.stack : String(error));
    return new BadGatewayException('Could not reach the AI service');
  }
}
