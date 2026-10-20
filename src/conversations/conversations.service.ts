import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { Conversation } from './conversation.schema.js';
import type { ChatMessage, ConversationDocument } from './conversation.schema.js';
import { AppException } from '../common/app.exception.js';

const notFound = () =>
  new AppException(HttpStatus.NOT_FOUND, 'NOT_FOUND', 'Conversation not found', {
    hint: 'It may have been deleted, or it belongs to another user.',
  });

// Shapes returned to the client (no internal fields like __v)
export interface ConversationSummary {
  id: string;
  title: string;
  messageCount: number;
  totalTokens: number;
  totalCostUsd: number;
  updatedAt?: Date;
}

export interface ConversationDetail extends ConversationSummary {
  messages: ChatMessage[];
}

// All database work for conversations lives here; controllers never touch the model directly
@Injectable()
export class ConversationsService {
  // @InjectModel gives us the Mongoose model registered in ConversationsModule
  constructor(
    @InjectModel(Conversation.name) private readonly conversationModel: Model<Conversation>,
  ) {}

  async listForUser(userId: string): Promise<ConversationSummary[]> {
    const conversations = await this.conversationModel
      .find({ userId })
      .sort({ updatedAt: -1 })
      .limit(50);

    return conversations.map((c) => this.toSummary(c));
  }

  // Always filter by userId too: someone else's conversation id gives "not found",
  // so users can't read each other's chats even if they guess an id.
  async findForUser(id: string, userId: string): Promise<ConversationDocument> {
    const conversation = await this.conversationModel.findOne({ _id: id, userId });

    if (!conversation) {
      throw notFound();
    }

    return conversation;
  }

  async getDetail(id: string, userId: string): Promise<ConversationDetail> {
    const conversation = await this.findForUser(id, userId);
    return { ...this.toSummary(conversation), messages: conversation.messages };
  }

  async create(userId: string, firstMessage: string): Promise<ConversationDocument> {
    return this.conversationModel.create({
      userId,
      title: this.makeTitle(firstMessage),
      messages: [],
    });
  }

  // Save one exchange (user message + model reply) and update the totals
  async addExchange(
    conversation: ConversationDocument,
    userText: string,
    reply: { text: string; tokens: number; costUsd: number; model: string },
  ): Promise<void> {
    conversation.messages.push({ role: 'user', text: userText });
    conversation.messages.push({
      role: 'model',
      text: reply.text,
      tokens: reply.tokens,
      costUsd: reply.costUsd,
      model: reply.model,
    });
    conversation.totalTokens += reply.tokens;
    conversation.totalCostUsd += reply.costUsd;

    await conversation.save();
  }

  async remove(id: string, userId: string): Promise<void> {
    const result = await this.conversationModel.deleteOne({ _id: id, userId });

    if (result.deletedCount === 0) {
      throw notFound();
    }
  }

  // The first words of the first message become the chat's title
  private makeTitle(message: string): string {
    const singleLine = message.replace(/\s+/g, ' ').trim();
    return singleLine.length > 50 ? singleLine.slice(0, 47) + '...' : singleLine;
  }

  private toSummary(conversation: ConversationDocument): ConversationSummary {
    return {
      id: conversation._id.toString(),
      title: conversation.title,
      messageCount: conversation.messages.length,
      totalTokens: conversation.totalTokens,
      totalCostUsd: conversation.totalCostUsd,
      updatedAt: conversation.updatedAt,
    };
  }
}
