import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Conversation, ConversationSchema } from './conversation.schema.js';
import { ConversationsController } from './conversations.controller.js';
import { ConversationsService } from './conversations.service.js';

@Module({
  // Registers the Conversation model so it can be injected with @InjectModel
  imports: [MongooseModule.forFeature([{ name: Conversation.name, schema: ConversationSchema }])],
  controllers: [ConversationsController],
  providers: [ConversationsService],
  // `exports` lets OTHER modules (ChatModule) use this service
  exports: [ConversationsService],
})
export class ConversationsModule {}
