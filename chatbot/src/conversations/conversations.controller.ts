import { Controller, Delete, Get, HttpCode, HttpStatus, Param } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ConversationsService } from './conversations.service.js';
import type { ConversationDetail, ConversationSummary } from './conversations.service.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { AuthUser } from '../auth/auth.types.js';
import { ParseObjectIdPipe } from '../common/parse-object-id.pipe.js';

// A REST resource: /conversations (list), /conversations/:id (read, delete).
// All routes are protected by the global AuthGuard.
@ApiTags('conversations')
@ApiBearerAuth()
@Controller('conversations')
export class ConversationsController {
  constructor(private readonly conversationsService: ConversationsService) {}

  @Get()
  @ApiOperation({ summary: "List the logged-in user's conversations (newest first)" })
  list(@CurrentUser() user: AuthUser): Promise<ConversationSummary[]> {
    return this.conversationsService.listForUser(user.userId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one conversation with all its messages' })
  get(
    @Param('id', ParseObjectIdPipe) id: string,
    @CurrentUser() user: AuthUser,
  ): Promise<ConversationDetail> {
    return this.conversationsService.getDetail(id, user.userId);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT) // 204: success, nothing to send back
  @ApiOperation({ summary: 'Delete a conversation' })
  remove(@Param('id', ParseObjectIdPipe) id: string, @CurrentUser() user: AuthUser): Promise<void> {
    return this.conversationsService.remove(id, user.userId);
  }
}
