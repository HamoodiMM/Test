import { Controller, Get, HttpStatus } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UsersService } from './users.service.js';
import type { PublicUser } from './users.service.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { AuthUser } from '../auth/auth.types.js';
import { AppException } from '../common/app.exception.js';

// Protected by the global AuthGuard (no @Public here)
@ApiTags('users')
@ApiBearerAuth()
@Controller()
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  // GET /profile: the account of whoever owns the token
  @Get('profile')
  @ApiOperation({ summary: "Get the logged-in user's profile" })
  async profile(@CurrentUser() user: AuthUser): Promise<{ user: PublicUser }> {
    const found = await this.usersService.findById(user.userId);

    // Token is valid, but the account was deleted after it was issued
    if (!found) {
      throw new AppException(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'User not found', {
        hint: 'This account no longer exists. Log in with another account.',
      });
    }

    return { user: this.usersService.toPublic(found) };
  }

  // GET /users: list all users (without passwords)
  @Get('users')
  @ApiOperation({ summary: 'List all users (no passwords)' })
  list(): Promise<PublicUser[]> {
    return this.usersService.findAll();
  }
}
