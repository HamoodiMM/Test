import path from "path";
import express from "express";
import helmet from "helmet";
import generalRoutes from "./routes/general.routes";
import authRoutes from "./routes/auth.routes";
import userRoutes from "./routes/user.routes";
import guestRequestRoutes from "./routes/guestRequest.routes";
import { notFound, errorHandler } from "./middleware/errorHandler";

// Builds and configures the Express app. Starting it (DB + listen) happens in server.ts.
export const app = express();

// The NestJS chatbot API the frontend talks to (a different origin than this server)
const CHATBOT_URL = process.env.CHATBOT_URL || "http://localhost:3001";

// 1. Global middleware: runs for every request, in this order
app.use(helmet({                           // security-related HTTP headers
    contentSecurityPolicy: {
        directives: {
            // Our page may only send fetch() requests to itself and the chatbot API
            connectSrc: ["'self'", CHATBOT_URL]
        }
    }
}));
app.use(express.json({ limit: "10kb" }));  // parse JSON bodies, reject oversized ones
app.use(express.static(path.join(__dirname, "../Frontend")));

// 2. Routes
app.use(generalRoutes);
app.use(authRoutes);
app.use(userRoutes);
app.use(guestRequestRoutes);

// 3. These must come AFTER all routes: Express tries middleware in the order it was added
app.use(notFound);
app.use(errorHandler);
