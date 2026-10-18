import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';

// Same "guestrequests" collection the Express app used, so old requests are kept
@Schema({ timestamps: true, collection: 'guestrequests' })
export class GuestRequest {
  @Prop({ required: true, trim: true, minlength: 10, maxlength: 1000 })
  message: string;

  @Prop({ required: true, trim: true })
  phone: string;
}

export const GuestRequestSchema = SchemaFactory.createForClass(GuestRequest);
