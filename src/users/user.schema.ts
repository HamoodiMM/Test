import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { HydratedDocument } from 'mongoose';

// Same shape as the old Express User model, and the same "users" collection,
// so every account created before the migration still works (bcrypt hashes included).
@Schema({ timestamps: true })
export class User {
  @Prop({ required: true, trim: true, minlength: 3, maxlength: 30 })
  username: string;

  @Prop({ required: true, unique: true, lowercase: true, trim: true })
  email: string;

  // The bcrypt hash. `select: false` = left out of every query unless asked for with "+password"
  @Prop({ required: true, select: false })
  password: string;

  createdAt?: Date;
  updatedAt?: Date;
}

export type UserDocument = HydratedDocument<User>;
export const UserSchema = SchemaFactory.createForClass(User);
