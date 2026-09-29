import { Request, Response, NextFunction } from "express";

// Runs when no route matched the request
export function notFound(req: Request, res: Response): void {
    res.status(404).json({ message: "Route not found" });
}

// Errors thrown by express.json() when the body can't be parsed
interface BodyParserError extends Error {
    type?: string;
}

// Express recognises an error handler by its 4 parameters (err, req, res, next).
// Any error thrown in a route, sync or async, ends up here.
export function errorHandler(err: BodyParserError, req: Request, res: Response, next: NextFunction): void {
    if (err.type === "entity.parse.failed") {
        res.status(400).json({ message: "Request body is not valid JSON" });
        return;
    }

    if (err.type === "entity.too.large") {
        res.status(413).json({ message: "Request body is too large" });
        return;
    }

    // Full details go to the server log only; the client gets a generic message
    // so stack traces, file paths and database details are never exposed.
    console.error("Unhandled error:", err);
    res.status(500).json({ message: "Something went wrong" });
}
