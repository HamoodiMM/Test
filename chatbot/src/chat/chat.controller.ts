import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ChatService } from './chat.service.js';
import type { ChatReply } from './chat.service.js';

// All routes in this class start with /chat
@Controller('chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  // POST /chat   body: { "message": "..." }
  // Note: the body is NOT validated yet. TypeScript trusts this type, but the client
  // can send anything. Stage 5 fixes that with a DTO and ValidationPipe.
  @Post()
  @HttpCode(HttpStatus.OK) // Nest uses 201 for POST by default; we create nothing, so 200
  async chat(@Body() body: { message: string }): Promise<ChatReply> {
    return this.chatService.sendMessage(body.message);
  }
}
