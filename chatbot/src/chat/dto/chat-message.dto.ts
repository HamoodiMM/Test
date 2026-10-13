import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsDefined, IsMongoId, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

// DTO = Data Transfer Object: describes the shape of incoming data AND its rules.
// It's a class (not an interface) because classes still exist at runtime,
// so ValidationPipe can read these decorators while the app runs.
// The @Api... decorators only describe the field for the Swagger docs at /docs.
export class ChatMessageDto {
  @ApiProperty({ example: 'Explain JWT in simple terms', maxLength: 2000 })
  // Trim spaces before validating, so "   " counts as empty
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  // class-validator runs these bottom-up: exists → is a string → not empty → length
  @MaxLength(2000, { message: 'Message must be at most 2000 characters' })
  @IsNotEmpty({ message: 'Message is required' })
  @IsString({ message: 'Message must be a string' })
  @IsDefined({ message: 'Message is required' })
  message!: string; // `!` tells TypeScript: Nest fills this in, not a constructor

  // Continue an existing conversation. Leave it out to start a new one.
  // The server loads the history from MongoDB, so the client no longer sends it.
  @ApiPropertyOptional({ example: '66f8a1c2e4b0a1b2c3d4e5f6' })
  @IsOptional()
  @IsMongoId({ message: 'Invalid conversation id' })
  conversationId?: string;
}
