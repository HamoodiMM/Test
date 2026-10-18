import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import type { Model } from 'mongoose';
import { User } from './user.schema.js';
import type { UserDocument } from './user.schema.js';

// What the API returns about a user. Never includes the password hash.
export interface PublicUser {
  id: string;
  username: string;
  email: string;
  createdAt?: Date;
}

// All database work for users. AuthService and UsersController use this; nobody else
// touches the User model directly.
@Injectable()
export class UsersService {
  constructor(@InjectModel(User.name) private readonly userModel: Model<User>) {}

  findByEmail(email: string): Promise<UserDocument | null> {
    return this.userModel.findOne({ email }).exec();
  }

  // Only login needs the hash, so it has to ask for it explicitly
  findByEmailWithPassword(email: string): Promise<UserDocument | null> {
    return this.userModel.findOne({ email }).select('+password').exec();
  }

  findById(id: string): Promise<UserDocument | null> {
    return this.userModel.findById(id).exec();
  }

  async findAll(): Promise<PublicUser[]> {
    const users = await this.userModel.find().sort({ createdAt: -1 }).exec();
    return users.map((u) => this.toPublic(u));
  }

  create(data: { username: string; email: string; passwordHash: string }): Promise<UserDocument> {
    return this.userModel.create({ username: data.username, email: data.email, password: data.passwordHash });
  }

  toPublic(user: UserDocument): PublicUser {
    return { id: user._id.toString(), username: user.username, email: user.email, createdAt: user.createdAt };
  }
}
