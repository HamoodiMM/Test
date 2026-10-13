import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ChatService } from './chat.service.js';
import type { ChatReply } from './chat.service.js';
import { ChatMessageDto } from './dto/chat-message.dto.js';

// All routes in this class start with /chat
@Controller('chat')
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  // POST /chat   body: { "message": "...", "history": [{ "role": "user", "text": "..." }, ...] }
  // By the time this method runs, the global ValidationPipe (main.ts) has already
  // checked the body against ChatMessageDto. Invalid requests never reach this code.
  @Post()
  @HttpCode(HttpStatus.OK) // Nest uses 201 for POST by default; we create nothing, so 200
  async chat(@Body() body: ChatMessageDto): Promise<ChatReply> {
    return this.chatService.sendMessage(body.message, body.history);
  }
}
