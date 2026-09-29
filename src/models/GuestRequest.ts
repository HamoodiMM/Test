import { Schema, model } from "mongoose";

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
            match: [/^01[0125][0-9]{8}$/, "Please provide a valid Egyptian phone number"]
        }
    },
    { timestamps: true }
);

export const GuestRequest = model<IGuestRequest>("GuestRequest", guestRequestSchema);
