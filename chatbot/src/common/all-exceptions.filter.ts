import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { Request, Response } from 'express';

// An exception filter decides what the client receives when something throws.
// @Catch() with no arguments = catch EVERYTHING. Same job as errorHandler in the Express app.
//
// Every error response gets one consistent shape:
//   { statusCode, message, error, path, timestamp }
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost): void {
    const context = host.switchToHttp();
    const request = context.getRequest<Request>();
    const response = context.getResponse<Response>();

    // Errors we threw on purpose (NotFoundException, 401 from AuthGuard, validation 400...)
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      const message = typeof body === 'string' ? body : (body as { message?: unknown }).message;

      this.logger.warn(`${request.method} ${request.originalUrl} ${status} - ${JSON.stringify(message)}`);

      response.status(status).json({
        statusCode: status,
        message: message ?? exception.message,
        error: HttpStatus[status] ?? 'Error',
        path: request.originalUrl,
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // Anything else is a bug: log the full details, send a generic message
    this.logger.error(
      `Unhandled error on ${request.method} ${request.originalUrl}`,
      exception instanceof Error ? exception.stack : String(exception),
    );

    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Something went wrong',
      error: 'INTERNAL_SERVER_ERROR',
      path: request.originalUrl,
      timestamp: new Date().toISOString(),
    });
  }
}
