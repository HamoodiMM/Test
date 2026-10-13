import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsDefined,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

// How many previous messages the client may send (10 user + 10 model = 10 exchanges).
// More history = more input tokens on EVERY request, so we cap it.
export const MAX_HISTORY_MESSAGES = 20;

// One earlier message in the conversation
export class ChatHistoryItemDto {
  @IsIn(['user', 'model'], { message: 'History role must be "user" or "model"' })
  role!: 'user' | 'model';

  @MaxLength(8000, { message: 'History messages must be at most 8000 characters' })
  @IsString({ message: 'History text must be a string' })
  @IsDefined({ message: 'History text is required' })
  text!: string;
}

// DTO = Data Transfer Object: describes the shape of incoming data AND its rules.
// It's a class (not an interface) because classes still exist at runtime,
// so ValidationPipe can read these decorators while the app runs.
export class ChatMessageDto {
  // Trim spaces before validating, so "   " counts as empty
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  // class-validator runs these bottom-up: exists → is a string → not empty → length
  @MaxLength(2000, { message: 'Message must be at most 2000 characters' })
  @IsNotEmpty({ message: 'Message is required' })
  @IsString({ message: 'Message must be a string' })
  @IsDefined({ message: 'Message is required' })
  message!: string; // `!` tells TypeScript: Nest fills this in, not a constructor

  // The conversation so far. Optional: a new chat has no history.
  @IsOptional()
  @Type(() => ChatHistoryItemDto) // turn each plain object into a ChatHistoryItemDto
  @ValidateNested({ each: true }) // validate every item with ChatHistoryItemDto's rules
  @ArrayMaxSize(MAX_HISTORY_MESSAGES, {
    message: `History can contain at most ${MAX_HISTORY_MESSAGES} messages`,
  })
  @IsArray({ message: 'History must be an array' }) // bottom = checked first
  history?: ChatHistoryItemDto[];
}
