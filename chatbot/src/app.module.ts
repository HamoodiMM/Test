import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { validateEnv } from './config/env.validation.js';
import { ChatModule } from './chat/chat.module.js';

@Module({
  imports: [
    // Reads chatbot/.env, validates it, and makes ConfigService available everywhere
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
    }),

    // Rate limiting per IP address. Every request counts against BOTH limits.
    // Protects our free Gemini quota from spam and runaway loops.
    ThrottlerModule.forRoot({
      throttlers: [
        { name: 'burst', ttl: 10_000, limit: 3 }, // max 3 requests per 10 seconds
        { name: 'minute', ttl: 60_000, limit: 10 }, // max 10 requests per minute
      ],
      errorMessage: 'Too many messages, please slow down and try again shortly',
    }),

    ChatModule,
  ],
  controllers: [AppController],
  providers: [AppService, { provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
