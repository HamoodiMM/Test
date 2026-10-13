import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { AuthGuard } from './auth.guard.js';
import type { Env } from '../config/env.validation.js';

@Module({
  imports: [
    // registerAsync + useFactory: build the module's options at startup,
    // AFTER ConfigService is ready (so we can read JWT_SECRET from .env)
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        secret: config.get('JWT_SECRET', { infer: true }),
      }),
    }),
  ],
  providers: [
    // APP_GUARD = apply this guard to every route in the whole app
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
})
export class AuthModule {}
