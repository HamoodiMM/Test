import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { AuthGuard } from './auth.guard.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { UsersModule } from '../users/users.module.js';
import type { Env } from '../config/env.validation.js';

@Module({
  imports: [
    UsersModule, // gives AuthService the exported UsersService

    // registerAsync + useFactory: build the module's options at startup,
    // AFTER ConfigService is ready (so we can read JWT_SECRET from .env)
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        secret: config.get('JWT_SECRET', { infer: true }),
        signOptions: { expiresIn: '1h', algorithm: 'HS256' }, // tokens expire after 1 hour
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    // APP_GUARD = apply this guard to every route in the whole app
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
})
export class AuthModule {}
