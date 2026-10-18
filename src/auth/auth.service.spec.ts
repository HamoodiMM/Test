import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcrypt';
import { AuthService } from './auth.service.js';
import type { UsersService } from '../users/users.service.js';
import { AppException } from '../common/app.exception.js';

const SECRET = 'test-secret-that-is-at-least-32-characters-long';

// A fake UsersService that keeps users in an array instead of MongoDB
function fakeUsersService() {
  const users: Array<{ _id: { toString(): string }; username: string; email: string; password: string }> = [];

  return {
    users,
    findByEmail: async (email: string) => users.find((u) => u.email === email) ?? null,
    findByEmailWithPassword: async (email: string) => users.find((u) => u.email === email) ?? null,
    create: async (data: { username: string; email: string; passwordHash: string }) => {
      const id = 'id-' + users.length; // capture now, before the push changes the length
      const user = { _id: { toString: () => id }, username: data.username, email: data.email, password: data.passwordHash };
      users.push(user);
      return user;
    },
    toPublic: (u: { _id: { toString(): string }; username: string; email: string }) => ({
      id: u._id.toString(),
      username: u.username,
      email: u.email,
    }),
  };
}

describe('AuthService', () => {
  let users: ReturnType<typeof fakeUsersService>;
  let jwtService: JwtService;
  let service: AuthService;

  beforeEach(() => {
    users = fakeUsersService();
    jwtService = new JwtService({ secret: SECRET, signOptions: { expiresIn: '1h' } });
    service = new AuthService(users as unknown as UsersService, jwtService);
  });

  it('registers a user and stores a bcrypt hash, never the password', async () => {
    const result = await service.register({ username: 'hamoodi', email: 'h@example.com', password: 'secret123' });

    expect(result.user).toEqual({ id: 'id-0', username: 'hamoodi', email: 'h@example.com' });
    expect(users.users[0].password).not.toBe('secret123');
    expect(await bcrypt.compare('secret123', users.users[0].password)).toBe(true);
  });

  it('rejects a duplicate email with 409 EMAIL_TAKEN', async () => {
    await service.register({ username: 'one', email: 'h@example.com', password: 'secret123' });

    await expect(
      service.register({ username: 'two', email: 'h@example.com', password: 'secret123' }),
    ).rejects.toMatchObject({ code: 'EMAIL_TAKEN', status: 409 });
  });

  it('logs in with the right password and returns a verifiable JWT', async () => {
    await service.register({ username: 'hamoodi', email: 'h@example.com', password: 'secret123' });

    const result = await service.login({ email: 'h@example.com', password: 'secret123' });
    const payload = await jwtService.verifyAsync(result.token);

    expect(payload).toMatchObject({ userId: 'id-0', username: 'hamoodi' });
  });

  it('rejects a wrong password with 401 INVALID_CREDENTIALS', async () => {
    await service.register({ username: 'hamoodi', email: 'h@example.com', password: 'secret123' });

    await expect(service.login({ email: 'h@example.com', password: 'wrong-pass1' })).rejects.toBeInstanceOf(AppException);
    await expect(service.login({ email: 'h@example.com', password: 'wrong-pass1' })).rejects.toMatchObject({
      code: 'INVALID_CREDENTIALS',
    });
  });

  it('gives an unknown email the SAME error as a wrong password', async () => {
    await expect(service.login({ email: 'nobody@example.com', password: 'secret123' })).rejects.toMatchObject({
      code: 'INVALID_CREDENTIALS',
      message: 'Invalid email or password',
    });
  });
});
