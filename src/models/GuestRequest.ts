import { Schema, model } from "mongoose";
import { EGYPT_PHONE_REGEX } from "../validation/guestRequest.schemas";

export interface IGuestRequest {
    message: string;
    phone: string;
}

const guestRequestSchema = new Schema<IGuestRequest>(
    {
        message: {
            type: String,
            required: [true, "Message is required"],
            trim: true,
            minlength: [10, "Message must be at least 10 characters"],
            maxlength: [1000, "Message must be at most 1000 characters"]
        },
        phone: {
            type: String,
            required: [true, "Phone number is required"],
            trim: true,
            match: [EGYPT_PHONE_REGEX,"Please provide a valid Egyptian phone number"]
        }
    },
    { timestamps: true }
);

export const GuestRequest = model<IGuestRequest>("GuestRequest", guestRequestSchema);
