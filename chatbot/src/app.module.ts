import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { validateEnv } from './config/env.validation.js';
import type { Env } from './config/env.validation.js';
import { AuthModule } from './auth/auth.module.js';
import { UsersModule } from './users/users.module.js';
import { GuestRequestsModule } from './guest-requests/guest-requests.module.js';
import { ChatModule } from './chat/chat.module.js';
import { ConversationsModule } from './conversations/conversations.module.js';

// The root module: plugs all feature modules together
@Module({
  imports: [
    // Reads .env, validates it, and makes ConfigService available everywhere
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
    }),

    // One MongoDB connection for the whole app
    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        uri: config.get('MONGODB_URI', { infer: true }),
        serverSelectionTimeoutMS: 10_000,
      }),
    }),

    // Two named rate-limit counters. The numbers here are defaults; each controller that
    // uses UserThrottlerGuard sets its own with @Throttle() (see common/throttle.config.ts).
    ThrottlerModule.forRoot({
      throttlers: [
        { name: 'burst', ttl: 10_000, limit: 3 },
        { name: 'minute', ttl: 60_000, limit: 10 },
      ],
      errorMessage: 'Too many requests, please slow down',
    }),

    AuthModule, // register, login, and the global AuthGuard (every route needs a JWT unless @Public())
    UsersModule, // GET /profile, GET /users
    GuestRequestsModule, // POST /requests
    ConversationsModule, // saved chats
    ChatModule, // POST /chat (Gemini)
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
