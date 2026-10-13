import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Observable, tap } from 'rxjs';

// An interceptor wraps the controller call: code runs BEFORE and AFTER it.
// Here: measure how long each request took and log it, e.g.
//   POST /chat 200 - 2153ms
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request>();
    const start = Date.now(); // BEFORE the controller

    // next.handle() runs the controller. It returns an Observable (a stream with the result);
    // tap() lets us run code when the result arrives, without changing it.
    return next.handle().pipe(
      tap(() => {
        const response = context.switchToHttp().getResponse<Response>(); // AFTER
        this.logger.log(
          `${request.method} ${request.originalUrl} ${response.statusCode} - ${Date.now() - start}ms`,
        );
      }),
    );
  }
}
