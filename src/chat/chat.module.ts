import { Module } from '@nestjs/common';
import { ChatService } from './chat.service.js';
import { ChatController } from './chat.controller.js';
import { ModelAvailabilityService } from './model-availability.service.js';
import { ConversationsModule } from '../conversations/conversations.module.js';

// Groups everything that belongs to the chat feature
@Module({
  // Importing ConversationsModule gives us its EXPORTED ConversationsService
  imports: [ConversationsModule],
  providers: [ChatService, ModelAvailabilityService],
  controllers: [ChatController],
})
export class ChatModule {}
