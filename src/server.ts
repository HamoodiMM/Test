import "dotenv/config";
import { app } from "./app";
import { connectDB } from "./config/db";
import { getJwtSecret } from "./config/jwt";

const PORT = Number(process.env.PORT) || 3000;

async function startServer(): Promise<void> {
    try {
        getJwtSecret(); // fail fast if JWT_SECRET is missing
        await connectDB();

        app.listen(PORT, () => {
            console.log(`Server is running on http://localhost:${PORT}`);
        });
    } catch (error) {
        console.error("Failed to start server:", error);
        process.exit(1);
    }
}

startServer();
