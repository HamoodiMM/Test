import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Model } from 'mongoose';
import { GuestRequest } from './guest-request.schema.js';
import { CreateGuestRequestDto } from './create-guest-request.dto.js';
import { Public } from '../auth/public.decorator.js';
import { UserThrottlerGuard } from '../common/user-throttler.guard.js';
import { GUEST_REQUEST_LIMITS } from '../common/throttle.config.js';

// POST /requests: visitors leave a message without an account.
// Small enough that a separate service class would only add boilerplate,
// so the controller saves through the model directly.
@ApiTags('guest requests')
@Controller('requests')
@Public()
@UseGuards(UserThrottlerGuard)
@Throttle(GUEST_REQUEST_LIMITS)
export class GuestRequestsController {
  constructor(@InjectModel(GuestRequest.name) private readonly guestRequestModel: Model<GuestRequest>) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Submit a guest request (no login needed)' })
  async create(@Body() dto: CreateGuestRequestDto): Promise<{ message: string }> {
    await this.guestRequestModel.create(dto);
    return { message: 'Request submitted successfully' };
  }
}
