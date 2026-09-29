import mongoose from "mongoose";

export async function connectDB(): Promise<void> {
    const uri = process.env.MONGODB_URI;

    if (!uri) {
        throw new Error("MONGODB_URI is not defined in .env");
    }

    await mongoose.connect(uri, {
        serverSelectionTimeoutMS: 10000
    });

    console.log("MongoDB connected");
}
