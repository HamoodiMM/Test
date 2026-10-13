import { Module } from '@nestjs/common';
import { ChatService } from './chat.service.js';
import { ChatController } from './chat.controller.js';

// Groups everything that belongs to the chat feature
@Module({
  providers: [ChatService],
  controllers: [ChatController],
})
export class ChatModule {}
