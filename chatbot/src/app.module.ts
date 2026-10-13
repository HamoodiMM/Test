import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { validateEnv } from './config/env.validation.js';
import type { Env } from './config/env.validation.js';
import { AuthModule } from './auth/auth.module.js';
import { ChatModule } from './chat/chat.module.js';
import { ConversationsModule } from './conversations/conversations.module.js';

// The root module: plugs all feature modules together
@Module({
  imports: [
    // Reads chatbot/.env, validates it, and makes ConfigService available everywhere
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
    }),

    // One MongoDB connection for the whole app (same database as the Express app)
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        uri: config.get('MONGODB_URI', { infer: true }),
        serverSelectionTimeoutMS: 10_000,
      }),
    }),

    // Rate limit settings. Applied to POST /chat by UserThrottlerGuard (per user).
    ThrottlerModule.forRoot({
      throttlers: [
        { name: 'burst', ttl: 10_000, limit: 3 }, // max 3 messages per 10 seconds
        { name: 'minute', ttl: 60_000, limit: 10 }, // max 10 messages per minute
      ],
      errorMessage: 'Too many messages, please slow down and try again shortly',
    }),

    AuthModule, // registers the global AuthGuard: every route needs a JWT unless @Public()
    ConversationsModule,
    ChatModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
