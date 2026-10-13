import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ChatService } from './chat.service.js';
import type { ChatReply } from './chat.service.js';
import { ChatMessageDto } from './dto/chat-message.dto.js';
import { UserThrottlerGuard } from './user-throttler.guard.js';
import { CurrentUser } from '../auth/current-user.decorator.js';
import type { AuthUser } from '../auth/auth.types.js';

// All routes in this class start with /chat
@ApiTags('chat')
@ApiBearerAuth()
@Controller('chat')
// Order of checks for every request here:
//   global AuthGuard (valid JWT?) → UserThrottlerGuard (too many messages?) →
//   ValidationPipe (valid body?) → this controller
@UseGuards(UserThrottlerGuard)
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  // POST /chat   body: { "message": "...", "conversationId": "..." (optional) }
  @Post()
  @HttpCode(HttpStatus.OK) // Nest uses 201 for POST by default; we return a reply, so 200
  @ApiOperation({ summary: 'Send a message to the AI assistant' })
  async chat(@Body() body: ChatMessageDto, @CurrentUser() user: AuthUser): Promise<ChatReply> {
    return this.chatService.sendMessage(user, body.message, body.conversationId);
  }
}
