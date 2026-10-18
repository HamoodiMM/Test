import { HttpException, HttpStatus } from '@nestjs/common';

// Machine-readable error codes. The frontend uses these to decide how to show an error
// (e.g. offer a Retry button, send the user back to login). Status codes alone are too
// coarse: a 503 can mean "AI overloaded" OR "AI daily quota used up".
export type ErrorCode =
  // Request problems (4xx)
  | 'VALIDATION_FAILED'
  | 'INVALID_JSON'
  | 'PAYLOAD_TOO_LARGE'
  | 'INVALID_ID'
  | 'ROUTE_NOT_FOUND'
  | 'NOT_FOUND'
  | 'EMAIL_TAKEN'
  | 'INVALID_CREDENTIALS'
  | 'AUTH_TOKEN_MISSING'
  | 'AUTH_TOKEN_INVALID'
  | 'AUTH_TOKEN_EXPIRED'
  | 'RATE_LIMITED'
  // AI provider problems (Gemini)
  | 'AI_DAILY_QUOTA'
  | 'AI_RATE_LIMITED'
  | 'AI_OVERLOADED'
  | 'AI_TIMEOUT'
  | 'AI_UNREACHABLE'
  | 'AI_MISCONFIGURED'
  | 'AI_BLOCKED'
  | 'AI_EMPTY_REPLY'
  // Our own bugs
  | 'INTERNAL_ERROR';

export interface AppErrorOptions {
  hint?: string; // what the user can do about it
  retryable?: boolean; // does trying again make sense?
  details?: Record<string, unknown>; // extra facts: model, retryAfterSeconds, fields...
}

// The body of every error response from this API
export interface ErrorResponseBody {
  statusCode: number;
  error: string; // HTTP status name, e.g. "Gateway Timeout"
  code: ErrorCode;
  message: string; // what happened, in plain language
  hint?: string;
  retryable: boolean;
  details?: Record<string, unknown>;
  path: string;
  timestamp: string;
}

// Throw this anywhere: AllExceptionsFilter turns it into an ErrorResponseBody
export class AppException extends HttpException {
  constructor(
    status: HttpStatus,
    readonly code: ErrorCode,
    message: string,
    readonly extra: AppErrorOptions = {},
  ) {
    super(message, status);
  }
}
