import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module.js';
import type { Env } from './config/env.validation.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Validate every incoming body against its DTO class before it reaches a controller
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // strip properties that aren't in the DTO
      forbidNonWhitelisted: true, // ...and reject the request if any were sent
      transform: true, // turn the plain JSON into a real DTO instance (runs @Transform)
      stopAtFirstError: true, // one clear message per field instead of several
    }),
  );

  // `true` = values were validated, so get() returns the real type instead of `T | undefined`
  const config = app.get<ConfigService<Env, true>>(ConfigService);
  const port = config.get('PORT', { infer: true });

  // CORS: browsers block a page on one origin (localhost:3000) from reading responses
  // from another (localhost:3001) unless that server explicitly allows it.
  // We allow exactly one origin: our own frontend. Not "*".
  app.enableCors({
    origin: config.get('CORS_ORIGIN', { infer: true }),
    methods: ['POST'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  await app.listen(port);

  // Log which model we use, but never the API key
  Logger.log(
    `Chatbot running on http://localhost:${port} (model: ${config.get('GEMINI_MODEL', { infer: true })})`,
    'Bootstrap',
  );
}
await bootstrap();
