import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { fileURLToPath } from 'node:url';
import { AppModule } from './app.module.js';
import type { Env } from './config/env.validation.js';
import { AllExceptionsFilter } from './common/all-exceptions.filter.js';
import { LoggingInterceptor } from './common/logging.interceptor.js';

// The static frontend (HTML/CSS/JS), relative to this compiled file (dist/main.js)
const FRONTEND_DIR = fileURLToPath(new URL('../Frontend/', import.meta.url));

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // Request lifecycle in Nest:
  //   Middleware (helmet, static files) → Guards (auth, rate limit) → Interceptor (before) →
  //   Pipes (validation) → Controller → Interceptor (after) → response.
  //   Any error → Exception filter.

  // Security headers. The Content Security Policy only allows scripts, styles and
  // fetch() calls from this same server, which blocks injected scripts (XSS).
  app.use(helmet());

  // Body size limit: reject huge requests (→ 413 PAYLOAD_TOO_LARGE)
  app.useBodyParser('json', { limit: '20kb' });

  // Serve the frontend from the same server and port as the API.
  // Same origin = no CORS needed at all.
  app.useStaticAssets(FRONTEND_DIR);

  // Validate every incoming body against its DTO class before it reaches a controller
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // strip properties that aren't in the DTO
      forbidNonWhitelisted: true, // ...and reject the request if any were sent
      transform: true, // turn the plain JSON into a real DTO instance (runs @Transform)
      stopAtFirstError: true, // one clear message per field instead of several
    }),
  );

  app.useGlobalInterceptors(new LoggingInterceptor()); // log method, URL, status, duration
  app.useGlobalFilters(new AllExceptionsFilter()); // one detailed error shape everywhere

  // `true` = values were validated, so get() returns the real type instead of `T | undefined`
  const config = app.get<ConfigService<Env, true>>(ConfigService);
  const port = config.get('PORT', { infer: true });

  // Interactive API documentation at /docs, generated from controllers, DTOs and @Api... decorators
  const swaggerConfig = new DocumentBuilder()
    .setTitle('My Auth App API')
    .setDescription(
      'Accounts, guest requests and an AI assistant powered by Gemini. ' +
        'Call POST /login, then click "Authorize" and paste the token to try the protected routes.',
    )
    .setVersion('2.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, swaggerConfig));

  await app.listen(port);

  // Log which model we use, but never the API key
  Logger.log(`App running on http://localhost:${port} (AI model: ${config.get('GEMINI_MODEL', { infer: true })})`, 'Bootstrap');
  Logger.log(`API docs: http://localhost:${port}/docs`, 'Bootstrap');
}
await bootstrap();
