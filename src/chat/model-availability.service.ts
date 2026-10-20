import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.validation.js';

// Why a model was taken out of rotation
export type UnavailableReason = 'AI_DAILY_QUOTA' | 'AI_RATE_LIMITED' | 'AI_OVERLOADED' | 'AI_TIMEOUT';

interface Cooldown {
  until: number; // timestamp (ms) when the model may be tried again
  reason: UnavailableReason;
}

// How long to skip a model when Google doesn't tell us exactly
const DEFAULT_COOLDOWN_MS: Record<UnavailableReason, number> = {
  AI_DAILY_QUOTA: 60 * 60_000, // replaced by "until midnight Pacific" below
  AI_RATE_LIMITED: 60_000,
  AI_OVERLOADED: 60_000,
  AI_TIMEOUT: 60_000,
};

// Remembers which Gemini models are temporarily unusable (a "circuit breaker").
//
// - When a model fails with a quota/overload/timeout error, it gets a cooldown.
// - During the cooldown, requests skip it and go straight to the next model,
//   so users don't wait for a request we already know will fail.
// - When the cooldown ends (e.g. the daily quota resets), the model is used again
//   automatically: the main model always comes first in the order.
//
// One instance for the whole app (Nest providers are singletons), kept in memory.
@Injectable()
export class ModelAvailabilityService {
  private readonly logger = new Logger(ModelAvailabilityService.name);
  private readonly cooldowns = new Map<string, Cooldown>();

  readonly primaryModel: string;
  readonly fallbackModels: string[];

  constructor(config: ConfigService<Env, true>) {
    this.primaryModel = config.get('GEMINI_MODEL', { infer: true });
    // Ignore duplicates and the primary model if it was listed again by mistake
    this.fallbackModels = [...new Set(config.get('GEMINI_FALLBACK_MODELS', { infer: true }))].filter(
      (model) => model !== this.primaryModel,
    );
  }

  // The order to try models in: available ones first (primary before fallbacks),
  // then the cooling-down ones as a last resort (a cooldown is a guess, it may have ended early).
  candidates(): string[] {
    const all = [this.primaryModel, ...this.fallbackModels];
    const available = all.filter((model) => this.isAvailable(model));
    const coolingDown = all.filter((model) => !this.isAvailable(model));
    return [...available, ...coolingDown];
  }

  isAvailable(model: string, now = Date.now()): boolean {
    const cooldown = this.cooldowns.get(model);
    if (!cooldown) {
      return true;
    }
    if (now >= cooldown.until) {
      this.cooldowns.delete(model); // cooldown over: the model is back in rotation
      this.logger.log(`Model "${model}" is available again (cooldown for ${cooldown.reason} ended)`);
      return true;
    }
    return false;
  }

  // retryAfterSeconds comes from Google's error when it provides one
  markUnavailable(model: string, reason: UnavailableReason, retryAfterSeconds?: number): Date {
    const now = Date.now();
    const until = retryAfterSeconds
      ? now + retryAfterSeconds * 1000
      : reason === 'AI_DAILY_QUOTA'
        ? nextMidnightPacific(now)
        : now + DEFAULT_COOLDOWN_MS[reason];

    this.cooldowns.set(model, { until, reason });
    this.logger.warn(`Model "${model}" unavailable (${reason}) until ${new Date(until).toISOString()}`);
    return new Date(until);
  }

  // Why a model is cooling down (undefined if it's available)
  reasonFor(model: string): UnavailableReason | undefined {
    const cooldown = this.cooldowns.get(model);
    return cooldown && cooldown.until > Date.now() ? cooldown.reason : undefined;
  }

  // When a cooling-down model will be back (undefined if it's available)
  availableAgainAt(model: string): Date | undefined {
    const cooldown = this.cooldowns.get(model);
    return cooldown && cooldown.until > Date.now() ? new Date(cooldown.until) : undefined;
  }

  // Used by tests to start from a clean state
  reset(): void {
    this.cooldowns.clear();
  }
}

// Gemini's free-tier daily quotas reset at midnight Pacific time
export function nextMidnightPacific(now: number): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(now));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);

  const secondsSinceMidnight = (get('hour') % 24) * 3600 + get('minute') * 60 + get('second');
  return now + (24 * 3600 - secondsSinceMidnight) * 1000;
}
