import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService, TokenExpiredError } from '@nestjs/jwt';
import type { Request } from 'express';
import { IS_PUBLIC_KEY } from './public.decorator.js';
import type { AuthUser } from './auth.types.js';

// A guard decides whether a request may continue (return true) or is rejected (throw).
// Registered globally in AuthModule, so EVERY route requires a valid JWT unless it's @Public().
//
// The token was issued by the Express app. We can verify it here because both apps
// share the same JWT_SECRET: two separate services trusting one token.
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // 1. Routes marked @Public() skip authentication
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(), // the method
      context.getClass(), // the controller class
    ]);

    if (isPublic) {
      return true;
    }

    // 2. Read "Authorization: Bearer <token>"
    const request = context.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const [type, token] = request.headers.authorization?.split(' ') ?? [];

    if (type !== 'Bearer' || !token) {
      throw new UnauthorizedException('Authentication token missing');
    }

    // 3. Verify signature + expiration (uses JWT_SECRET from JwtModule)
    try {
      const payload = await this.jwtService.verifyAsync<Partial<AuthUser>>(token, {
        algorithms: ['HS256'],
      });

      if (typeof payload.userId !== 'string') {
        throw new UnauthorizedException('Invalid token');
      }

      // 4. Make the user available to the controller (see @CurrentUser)
      request.user = {
        userId: payload.userId,
        username: typeof payload.username === 'string' ? payload.username : 'there',
      };
      return true;
    } catch (error) {
      if (error instanceof TokenExpiredError) {
        throw new UnauthorizedException('Token expired, please log in again');
      }
      throw new UnauthorizedException('Invalid token');
    }
  }
}
