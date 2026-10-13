import { Transform } from 'class-transformer';
import { IsDefined, IsNotEmpty, IsString, MaxLength } from 'class-validator';

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
}
