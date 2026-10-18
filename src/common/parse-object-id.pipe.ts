import { HttpStatus, Injectable, PipeTransform } from '@nestjs/common';
import { isValidObjectId } from 'mongoose';
import { AppException } from './app.exception.js';

// Custom pipe: checks a URL parameter is a valid MongoDB id BEFORE the controller runs.
// Usage: @Param('id', ParseObjectIdPipe) id: string
// Without it, "/conversations/abc" would make Mongoose throw a CastError (500).
@Injectable()
export class ParseObjectIdPipe implements PipeTransform<string, string> {
  transform(value: string): string {
    if (!isValidObjectId(value)) {
      throw new AppException(HttpStatus.BAD_REQUEST, 'INVALID_ID', 'Invalid conversation id', {
        hint: 'Ids are 24-character hexadecimal MongoDB ObjectIds.',
        details: { received: value },
      });
    }
    return value;
  }
}
