import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { AppException } from './app.exception.js';
import type { ErrorCode, ErrorResponseBody } from './app.exception.js';

// An exception filter decides what the client receives when something throws.
// @Catch() with no arguments = catch EVERYTHING.
//
// Every error leaves the API in ONE detailed shape (see ErrorResponseBody):
//   { statusCode, error, code, message, hint, retryable, details, path, timestamp }
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const request = context.getRequest<Request>();
    const response = context.getResponse<Response>();

    const body = this.toBody(exception, request, response);

    if (body.statusCode >= 500) {
      this.logger.error(
        `${request.method} ${request.originalUrl} ${body.statusCode} ${body.code} - ${body.message}`,
        exception instanceof Error && body.code === 'INTERNAL_ERROR' ? exception.stack : undefined,
      );
    } else {
      this.logger.warn(`${request.method} ${request.originalUrl} ${body.statusCode} ${body.code} - ${body.message}`);
    }

    response.status(body.statusCode).json(body);
  }

  private toBody(exception: unknown, request: Request, response: Response): ErrorResponseBody {
    const base = { path: request.originalUrl, timestamp: new Date().toISOString() };

    // 1. Errors we threw on purpose with full details
    if (exception instanceof AppException) {
      return {
        statusCode: exception.getStatus(),
        error: this.statusName(exception.getStatus()),
        code: exception.code,
        message: exception.message,
        hint: exception.extra.hint,
        retryable: exception.extra.retryable ?? false,
        details: exception.extra.details,
        ...base,
      };
    }

    // 2. Rate limit from @nestjs/throttler: add how long to wait
    if (exception instanceof ThrottlerException) {
      const retryAfterSeconds = this.retryAfterFromHeaders(response);
      return {
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        error: 'Too Many Requests',
        code: 'RATE_LIMITED',
        message: exception.message,
        hint: retryAfterSeconds
          ? `Wait ${retryAfterSeconds} seconds before trying again.`
          : 'Wait a little before trying again.',
        retryable: true,
        details: retryAfterSeconds ? { retryAfterSeconds } : undefined,
        ...base,
      };
    }

    // 3. Other Nest HTTP errors (ValidationPipe, unknown route, bad JSON, body too large...)
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const raw = exception.getResponse();
      const rawMessage = typeof raw === 'string' ? raw : (raw as { message?: unknown }).message;
      const messages = Array.isArray(rawMessage) ? rawMessage.map(String) : [String(rawMessage ?? exception.message)];

      const { code, hint } = this.classify(status, messages[0]);

      return {
        statusCode: status,
        error: this.statusName(status),
        code,
        message: messages.join('; '),
        hint,
        retryable: status >= 500,
        // Validation: list every problem separately so the UI can show them all
        details: code === 'VALIDATION_FAILED' && messages.length > 1 ? { problems: messages } : undefined,
        ...base,
      };
    }

    // 4. The JSON body parser rejects oversized bodies before Nest's own error handling runs,
    //    so its error is a plain object with { status: 413, type: 'entity.too.large' }
    const parserError = exception as { status?: number; type?: string; limit?: number };
    if (parserError?.type === 'entity.too.large' || parserError?.status === 413) {
      return {
        statusCode: HttpStatus.PAYLOAD_TOO_LARGE,
        error: 'Payload Too Large',
        code: 'PAYLOAD_TOO_LARGE',
        message: 'The request body is too large',
        hint: 'Send a smaller request (the limit is 20 KB).',
        retryable: false,
        details: parserError.limit ? { limitBytes: parserError.limit } : undefined,
        ...base,
      };
    }

    // 5. Anything else is a bug in our code: never leak its details to the client
    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      error: 'Internal Server Error',
      code: 'INTERNAL_ERROR',
      message: 'Something went wrong on the server.',
      hint: 'Please try again. If it keeps happening, check the server log.',
      retryable: true,
      ...base,
    };
  }

  private classify(status: number, firstMessage: string): { code: ErrorCode; hint?: string } {
    if (status === 400 && /JSON/i.test(firstMessage)) {
      return { code: 'INVALID_JSON', hint: 'The request body must be valid JSON.' };
    }
    if (status === 400) {
      return { code: 'VALIDATION_FAILED', hint: 'Correct the problems above and try again.' };
    }
    if (status === 404) {
      return { code: 'ROUTE_NOT_FOUND', hint: 'Check the URL and HTTP method.' };
    }
    if (status === 413) {
      return { code: 'PAYLOAD_TOO_LARGE', hint: 'Send a smaller request body.' };
    }
    if (status === 401) {
      return { code: 'AUTH_TOKEN_INVALID', hint: 'Log in again.' };
    }
    return { code: 'INTERNAL_ERROR' };
  }

  // The throttler sets headers like "Retry-After-minute: 42"; take the longest wait
  private retryAfterFromHeaders(response: Response): number | undefined {
    const waits = Object.entries(response.getHeaders())
      .filter(([name]) => name.toLowerCase().startsWith('retry-after'))
      .map(([, value]) => Number(value))
      .filter((n) => Number.isFinite(n));
    return waits.length ? Math.max(...waits) : undefined;
  }

  // 504 → "Gateway Timeout", 429 → "Too Many Requests"...
  private statusName(status: number): string {
    const name = HttpStatus[status];
    return typeof name === 'string'
      ? name.toLowerCase().split('_').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ')
      : 'Error';
  }
}
