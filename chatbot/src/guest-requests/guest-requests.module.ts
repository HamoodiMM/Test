import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { GuestRequest, GuestRequestSchema } from './guest-request.schema.js';
import { GuestRequestsController } from './guest-requests.controller.js';

@Module({
  imports: [MongooseModule.forFeature([{ name: GuestRequest.name, schema: GuestRequestSchema }])],
  controllers: [GuestRequestsController],
})
export class GuestRequestsModule {}
