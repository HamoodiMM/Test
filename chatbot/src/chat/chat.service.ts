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
import type { GenerateContentResponse } from '@google/genai';
import type { Env } from '../config/env.validation.js';

// How many tokens one request used. Free-tier limits and pricing are counted in tokens.
export interface TokenUsage {
  inputTokens: number; // your message + system instruction
  outputTokens: number; // the reply text
  thinkingTokens: number; // internal "reasoning" some models do before answering
  totalTokens: number;
}

export interface ChatReply {
  reply: string;
  model: string;
  usage: TokenUsage;
}

// Instructions the model follows for every message (the user never sees this)
const SYSTEM_INSTRUCTION =
  'You are a friendly, concise assistant inside "My Auth App", a student backend project. ' +
  'Answer clearly in a few short paragraphs at most.';

@Injectable()
export class ChatService {
  private readonly logger = new Logger(ChatService.name);
  private readonly ai: GoogleGenAI;
  private readonly model: string;

  // Dependency injection: Nest passes in ConfigService because ConfigModule is global
  constructor(config: ConfigService<Env, true>) {
    // The API key identifies OUR app to Google. It's sent with every request to Gemini.
    this.ai = new GoogleGenAI({
      apiKey: config.get('GEMINI_API_KEY', { infer: true }),
      // Never wait forever on an external API
      httpOptions: { timeout: config.get('GEMINI_TIMEOUT_MS', { infer: true }) },
    });
    this.model = config.get('GEMINI_MODEL', { infer: true });
  }

  async sendMessage(message: string): Promise<ChatReply> {
    let response: GenerateContentResponse;

    try {
      // One HTTPS request to Google's Gemini API
      response = await this.ai.models.generateContent({
        model: this.model,
        contents: message,
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
        },
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

    const usage = response.usageMetadata;

    return {
      reply: response.text,
      model: response.modelVersion ?? this.model,
      usage: {
        inputTokens: usage?.promptTokenCount ?? 0,
        outputTokens: usage?.candidatesTokenCount ?? 0,
        thinkingTokens: usage?.thoughtsTokenCount ?? 0,
        totalTokens: usage?.totalTokenCount ?? 0,
      },
    };
  }

  // Translate a Gemini failure into an HTTP error for OUR client.
  // Full details go to the server log; the client gets a safe, useful message.
  private toHttpException(error: unknown): Error {
    if (error instanceof ApiError) {
      this.logger.error(`Gemini API error ${error.status}: ${error.message}`);

      // Rate limit / quota exhausted on our API key
      if (error.status === 429) {
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
