import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsDefined, IsEmail, IsString, Length, Matches } from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const trimLower = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().toLowerCase() : value);

// Same rules as the old Express Zod schema. Decorators run bottom-up per property:
// "is it there?" → "is it a string?" → the specific rules.
export class RegisterDto {
  @ApiProperty({ example: 'hamoodi', minLength: 3, maxLength: 30 })
  @Transform(trim)
  @Length(3, 30, { message: 'Username must be 3-30 characters' })
  @IsString({ message: 'Username must be a string' })
  @IsDefined({ message: 'Username is required' })
  username!: string;

  @ApiProperty({ example: 'hamoodi@example.com' })
  @Transform(trimLower) // emails are stored lowercase, so Test@x.com and test@x.com are the same account
  @IsEmail({}, { message: 'Please provide a valid email address' })
  @IsString({ message: 'Email must be a string' })
  @IsDefined({ message: 'Email is required' })
  email!: string;

  // bcrypt only uses the first 72 bytes of a password, so longer ones are rejected
  @ApiProperty({ example: 'secret123', minLength: 8, maxLength: 72 })
  @Matches(/[0-9]/, { message: 'Password must contain at least one number' })
  @Matches(/[A-Za-z]/, { message: 'Password must contain at least one letter' })
  @Length(8, 72, { message: 'Password must be 8-72 characters' })
  @IsString({ message: 'Password must be a string' })
  @IsDefined({ message: 'Password is required' })
  password!: string;
}
