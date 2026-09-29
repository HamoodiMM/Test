import { rateLimit } from "express-rate-limit";

// Login/register: slows down password guessing (brute force) and mass account creation
export const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    limit: 10,                // max 10 requests per IP per window
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { message: "Too many attempts, please try again in 15 minutes" }
});

// Guest requests: stops one person from flooding the database with spam
export const guestRequestLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    limit: 5,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { message: "Too many requests submitted, please try again later" }
});
