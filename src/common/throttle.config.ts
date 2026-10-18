// Rate limits per route group. ThrottlerModule defines two named counters ("burst" and
// "minute") that apply to every route using UserThrottlerGuard; @Throttle() on a controller
// overrides their numbers for that controller.
const MINUTE = 60_000;

// Chat: protects the Gemini quota (3 messages per 10 s, 10 per minute)
export const CHAT_LIMITS = {
  burst: { limit: 3, ttl: 10_000 },
  minute: { limit: 10, ttl: MINUTE },
};

// Register + login: slows down password guessing (10 attempts per 15 minutes)
export const AUTH_LIMITS = {
  burst: { limit: 10, ttl: 15 * MINUTE },
  minute: { limit: 10, ttl: 15 * MINUTE },
};

// Guest requests: stops spam (5 per hour)
export const GUEST_REQUEST_LIMITS = {
  burst: { limit: 5, ttl: 60 * MINUTE },
  minute: { limit: 5, ttl: 60 * MINUTE },
};
