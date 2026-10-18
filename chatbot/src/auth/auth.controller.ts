import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service.js';
import { RegisterDto } from './dto/register.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { Public } from './public.decorator.js';
import { UserThrottlerGuard } from '../common/user-throttler.guard.js';
import { AUTH_LIMITS } from '../common/throttle.config.js';

// POST /register and POST /login: same URLs as the old Express app,
// so the frontend didn't need to change them.
@ApiTags('auth')
@Controller()
@Public() // no token needed to log in, obviously
@UseGuards(UserThrottlerGuard)
@Throttle(AUTH_LIMITS)
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create an account' })
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Log in and receive a JWT (valid 1 hour)' })
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }
}
