import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module.js';
import type { Env } from './config/env.validation.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // `true` = values were validated, so get() returns the real type instead of `T | undefined`
  const config = app.get<ConfigService<Env, true>>(ConfigService);
  const port = config.get('PORT', { infer: true });

  await app.listen(port);

  // Log which model we use, but never the API key
  Logger.log(
    `Chatbot running on http://localhost:${port} (model: ${config.get('GEMINI_MODEL', { infer: true })})`,
    'Bootstrap',
  );
}
await bootstrap();
