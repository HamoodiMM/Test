import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenAI } from '@google/genai';
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
  private readonly ai: GoogleGenAI;
  private readonly model: string;

  // Dependency injection: Nest passes in ConfigService because ConfigModule is global
  constructor(config: ConfigService<Env, true>) {
    // The API key identifies OUR app to Google. It's sent with every request to Gemini.
    this.ai = new GoogleGenAI({
      apiKey: config.get('GEMINI_API_KEY', { infer: true }),
      // Never wait forever on an external API: give up after 30 seconds
      httpOptions: { timeout: 30_000 },
    });
    this.model = config.get('GEMINI_MODEL', { infer: true });
  }

  async sendMessage(message: string): Promise<ChatReply> {
    // One HTTPS request to Google's Gemini API
    const response = await this.ai.models.generateContent({
      model: this.model,
      contents: message,
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
      },
    });

    const usage = response.usageMetadata;

    return {
      reply: response.text ?? '',
      model: response.modelVersion ?? this.model,
      usage: {
        inputTokens: usage?.promptTokenCount ?? 0,
        outputTokens: usage?.candidatesTokenCount ?? 0,
        thinkingTokens: usage?.thoughtsTokenCount ?? 0,
        totalTokens: usage?.totalTokenCount ?? 0,
      },
    };
  }
}
