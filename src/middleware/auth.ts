import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { getJwtSecret } from "../config/jwt";

// The data we put inside the token when the user logs in
export interface AuthPayload {
    userId: string;
}

// Teach TypeScript that Express's Request can carry a `user` property,
// which this middleware fills in for the handlers that run after it.
declare global {
    namespace Express {
        interface Request {
            user?: AuthPayload;
        }
    }
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
    // 1. Read the Authorization header, expected format: "Bearer <token>"
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        res.status(401).json({ message: "Authentication token missing" });
        return;
    }

    // 2. Extract the token part after "Bearer "
    const token = authHeader.slice("Bearer ".length).trim();

    try {
        // 3. Verify the signature and expiration. Throws if either is bad.
        const decoded = jwt.verify(token, getJwtSecret(), { algorithms: ["HS256"] });

        if (typeof decoded === "string" || typeof decoded.userId !== "string") {
            res.status(401).json({ message: "Invalid token" });
            return;
        }

        // 4. Make the user's identity available to the next handler
        req.user = { userId: decoded.userId };
        next();
    } catch (error) {
        if (error instanceof jwt.TokenExpiredError) {
            res.status(401).json({ message: "Token expired, please log in again" });
            return;
        }

        res.status(401).json({ message: "Invalid token" });
    }
}
