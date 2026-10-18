import { HttpStatus, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcrypt';
import { UsersService } from '../users/users.service.js';
import type { PublicUser } from '../users/users.service.js';
import type { RegisterDto } from './dto/register.dto.js';
import type { LoginDto } from './dto/login.dto.js';
import type { AuthUser } from './auth.types.js';
import { AppException } from '../common/app.exception.js';

const BCRYPT_ROUNDS = 10;

// One message for "unknown email" AND "wrong password", so attackers can't use the
// login form to find out which emails are registered (user enumeration).
const invalidCredentials = () =>
  new AppException(HttpStatus.UNAUTHORIZED, 'INVALID_CREDENTIALS', 'Invalid email or password', {
    hint: 'Check your email and password. Emails are not case-sensitive; passwords are.',
  });

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
  ) {}

  async register(dto: RegisterDto): Promise<{ message: string; user: PublicUser }> {
    if (await this.usersService.findByEmail(dto.email)) {
      throw this.emailTaken(dto.email);
    }

    // Never store the real password: only its salted, one-way bcrypt hash
    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);

    try {
      const user = await this.usersService.create({ username: dto.username, email: dto.email, passwordHash });
      return { message: 'User registered successfully', user: this.usersService.toPublic(user) };
    } catch (error) {
      // Two registrations with the same email at the same moment: the unique index catches it
      if ((error as { code?: number }).code === 11000) {
        throw this.emailTaken(dto.email);
      }
      throw error;
    }
  }

  async login(dto: LoginDto): Promise<{ message: string; token: string; user: PublicUser }> {
    const user = await this.usersService.findByEmailWithPassword(dto.email);

    if (!user || !(await bcrypt.compare(dto.password, user.password))) {
      throw invalidCredentials();
    }

    // The payload is readable by anyone (signed, not encrypted): only non-secret data.
    // Expiry ("1h") comes from JwtModule's signOptions.
    const payload: AuthUser = { userId: user._id.toString(), username: user.username };
    const token = await this.jwtService.signAsync(payload);

    return { message: 'Login successful', token, user: this.usersService.toPublic(user) };
  }

  private emailTaken(email: string): AppException {
    return new AppException(HttpStatus.CONFLICT, 'EMAIL_TAKEN', 'Email is already registered', {
      hint: 'Log in instead, or register with a different email.',
      details: { email },
    });
  }
}
