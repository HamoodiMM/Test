import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AppService } from './app.service.js';
import type { HealthStatus } from './app.service.js';
import { Public } from './auth/public.decorator.js';

@ApiTags('health')
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  // GET /health: lets you (or a hosting platform) check the API and database are up.
  // @Public() = no token needed.
  @Public()
  @Get('health')
  @ApiOperation({ summary: 'Check that the API and database are up' })
  getHealth(): HealthStatus {
    return this.appService.getHealth();
  }
}
