import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { HydratedDocument } from 'mongoose';

// Same Mongoose concepts as the Express app (schema → model → document),
// written with decorators, the Nest way.

// One message inside a conversation. `_id: false` = no separate id per message.
@Schema({ _id: false, timestamps: { createdAt: true, updatedAt: false } })
export class ChatMessage {
  @Prop({ required: true, enum: ['user', 'model'] })
  role: 'user' | 'model';

  @Prop({ required: true })
  text: string;

  // Tokens and cost of the request that produced this reply (only on "model" messages)
  @Prop()
  tokens?: number;

  @Prop()
  costUsd?: number;

  // Which Gemini model wrote this reply (it can differ per message when a fallback was used)
  @Prop()
  model?: string;

  createdAt?: Date;
}

export const ChatMessageSchema = SchemaFactory.createForClass(ChatMessage);

// A whole conversation, owned by one user. Stored in the "conversations" collection.
@Schema({ timestamps: true })
export class Conversation {
  // The id from the JWT. Every query filters by it, so users only see their own chats.
  @Prop({ required: true, index: true })
  userId: string;

  @Prop({ required: true, maxlength: 80 })
  title: string;

  @Prop({ type: [ChatMessageSchema], default: [] })
  messages: ChatMessage[];

  @Prop({ default: 0 })
  totalTokens: number;

  @Prop({ default: 0 })
  totalCostUsd: number;

  createdAt?: Date;
  updatedAt?: Date;
}

export type ConversationDocument = HydratedDocument<Conversation>;
export const ConversationSchema = SchemaFactory.createForClass(Conversation);

// Speeds up "list this user's chats, newest first"
ConversationSchema.index({ userId: 1, updatedAt: -1 });
