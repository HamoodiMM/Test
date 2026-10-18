import { ExecutionContext } from '@nestjs/common';
import { AppException } from '../common/app.exception.js';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { AuthGuard } from './auth.guard.js';

const SECRET = 'test-secret-that-is-at-least-32-characters-long';

// Builds a fake ExecutionContext containing a request with the given Authorization header
function contextWith(authorization?: string) {
  const request: { headers: { authorization?: string }; user?: unknown } = {
    headers: { authorization },
  };

  const context = {
    getHandler: () => ({}),
    getClass: () => ({}),
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;

  return { context, request };
}

describe('AuthGuard', () => {
  const jwtService = new JwtService({ secret: SECRET });
  const reflector = new Reflector();
  const guard = new AuthGuard(jwtService, reflector);

  it('accepts a valid token and attaches the user to the request', async () => {
    const token = jwtService.sign({ userId: 'abc123', username: 'hamoodi' });
    const { context, request } = contextWith(`Bearer ${token}`);

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.user).toEqual({ userId: 'abc123', username: 'hamoodi' });
  });

  it('rejects a request without a token', async () => {
    const { context } = contextWith(undefined);
    await expect(guard.canActivate(context)).rejects.toThrow('Authentication token missing');
  });

  it('rejects a header without "Bearer "', async () => {
    const token = jwtService.sign({ userId: 'abc123' });
    const { context } = contextWith(token);
    await expect(guard.canActivate(context)).rejects.toThrow(AppException);
    await expect(guard.canActivate(context)).rejects.toMatchObject({ code: 'AUTH_TOKEN_MISSING' });
  });

  it('rejects a token signed with a different secret', async () => {
    const forged = new JwtService({ secret: 'some-other-secret-that-is-also-very-long!' }).sign({
      userId: 'abc123',
    });
    const { context } = contextWith(`Bearer ${forged}`);
    await expect(guard.canActivate(context)).rejects.toThrow('Invalid token');
  });

  it('rejects an expired token', async () => {
    const expired = jwtService.sign({ userId: 'abc123', exp: Math.floor(Date.now() / 1000) - 60 });
    const { context } = contextWith(`Bearer ${expired}`);
    await expect(guard.canActivate(context)).rejects.toThrow('Token expired, please log in again');
    await expect(guard.canActivate(context)).rejects.toMatchObject({ code: 'AUTH_TOKEN_EXPIRED' });
  });

  it('lets @Public() routes through without a token', async () => {
    const publicGuard = new AuthGuard(jwtService, {
      getAllAndOverride: () => true,
    } as unknown as Reflector);
    const { context } = contextWith(undefined);

    await expect(publicGuard.canActivate(context)).resolves.toBe(true);
  });
});
