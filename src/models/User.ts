import { Schema, model } from "mongoose";

export interface IUser {
    username: string;
    email: string;
    password: string;
}

const userSchema = new Schema<IUser>(
    {
        username: {
            type: String,
            required: [true, "Username is required"],
            trim: true,
            minlength: [3, "Username must be at least 3 characters"],
            maxlength: [30, "Username must be at most 30 characters"]
        },
        email: {
            type: String,
            required: [true, "Email is required"],
            unique: true,
            lowercase: true,
            trim: true
        },
        password: {
            type: String,
            required: [true, "Password is required"],
            select: false
        }
    },
    { timestamps: true }
);

export const User = model<IUser>("User", userSchema);
