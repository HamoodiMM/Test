import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module.js';
import type { Env } from './config/env.validation.js';
import { AllExceptionsFilter } from './common/all-exceptions.filter.js';
import { LoggingInterceptor } from './common/logging.interceptor.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Request lifecycle in Nest:
  //   Guards (auth, rate limit) → Interceptor (before) → Pipes (validation) →
  //   Controller → Interceptor (after) → response.   Any error → Exception filter.

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
  app.useGlobalFilters(new AllExceptionsFilter()); // one consistent error shape

  // `true` = values were validated, so get() returns the real type instead of `T | undefined`
  const config = app.get<ConfigService<Env, true>>(ConfigService);
  const port = config.get('PORT', { infer: true });

  // CORS: browsers block a page on one origin (localhost:3000) from reading responses
  // from another (localhost:3001) unless that server explicitly allows it.
  // We allow exactly one origin: our own frontend. Not "*".
  app.enableCors({
    origin: config.get('CORS_ORIGIN', { infer: true }),
    methods: ['GET', 'POST', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  // Interactive API documentation at http://localhost:3001/docs, generated from the
  // controllers, DTOs and @Api... decorators. You can send test requests from it too.
  const swaggerConfig = new DocumentBuilder()
    .setTitle('My Auth App - Chatbot API')
    .setDescription(
      'AI assistant powered by Gemini. Log in through the Express app, then click ' +
        '"Authorize" and paste the JWT to try the protected routes.',
    )
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, swaggerConfig));

  await app.listen(port);

  // Log which model we use, but never the API key
  Logger.log(
    `Chatbot running on http://localhost:${port} (model: ${config.get('GEMINI_MODEL', { infer: true })})`,
    'Bootstrap',
  );
  Logger.log(`API docs: http://localhost:${port}/docs`, 'Bootstrap');
}
await bootstrap();
