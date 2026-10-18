import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsDefined, IsString, Length, Matches } from 'class-validator';

// Egyptian mobile: 010, 011, 012 or 015 followed by 8 digits
export const EGYPT_PHONE_REGEX = /^01[0125][0-9]{8}$/;

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

export class CreateGuestRequestDto {
  @ApiProperty({ example: 'I need help resetting my account', minLength: 10, maxLength: 1000 })
  @Transform(trim)
  @Length(10, 1000, { message: 'Request must be 10-1000 characters' })
  @IsString({ message: 'Message must be a string' })
  @IsDefined({ message: 'Message is required' })
  message!: string;

  @ApiProperty({ example: '01012345678' })
  @Transform(trim)
  @Matches(EGYPT_PHONE_REGEX, { message: 'Please provide a valid Egyptian phone number (e.g. 01012345678)' })
  @IsString({ message: 'Phone number must be a string' })
  @IsDefined({ message: 'Phone number is required' })
  phone!: string;
}
