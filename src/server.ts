import "dotenv/config";
import path from "path";
import express from "express";
import bcrypt from "bcrypt";
import mongoose from "mongoose";
import { connectDB } from "./config/db";
import { User } from "./models/User";

const app = express();

const PORT = Number(process.env.PORT) || 3000;

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface Request {
    id: number;
    message: string;
    phone: string;
}

const requests: Request[] = [];

app.use(express.json());
app.use(express.static(path.join(__dirname, "../Frontend")));

app.get("/", (req, res) => {
    res.send("Welcome to my Test API!");
});

app.get("/hello", (req, res) => {
    res.send("Hello Hamoodi!");
});

app.get("/about", (req, res) => {
    res.send("Test Test.");
});

// Password is excluded automatically because of `select: false` in the User schema
app.get("/users", async (req, res) => {
    const users = await User.find();
    res.json(users);
});

app.post("/register", async (req, res) => {
    const { username, email, password } = req.body;

    if (
        typeof username !== "string" ||
        typeof email !== "string" ||
        typeof password !== "string" ||
        !username.trim() ||
        !email.trim() ||
        !password
    ) {
        return res.status(400).json({
            message: "Username, email and password are required"
        });
    }

    const normalizedEmail = email.trim().toLowerCase();

    if (!emailRegex.test(normalizedEmail)) {
        return res.status(400).json({
            message: "Please provide a valid email address"
        });
    }

    if (password.length < 6) {
        return res.status(400).json({
            message: "Password must be at least 6 characters"
        });
    }

    try {
        const existingUser = await User.findOne({ email: normalizedEmail });

        if (existingUser) {
            return res.status(409).json({
                message: "Email is already registered"
            });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const newUser = await User.create({
            username: username,
            email: normalizedEmail,
            password: hashedPassword
        });

        res.status(201).json({
            message: "User registered successfully",
            user: {
                id: newUser._id,
                username: newUser.username,
                email: newUser.email
            }
        });
    } catch (error) {
        // Schema rules failed (e.g. username shorter than 3 characters)
        if (error instanceof mongoose.Error.ValidationError) {
            const firstError = Object.values(error.errors)[0];
            return res.status(400).json({ message: firstError.message });
        }

        // Unique index violation: two registrations with the same email at the same moment
        if ((error as { code?: number }).code === 11000) {
            return res.status(409).json({
                message: "Email is already registered"
            });
        }

        console.error("Registration error:", error);
        res.status(500).json({ message: "Something went wrong" });
    }
});

app.post("/login", async (req, res) => {
    const { email, password } = req.body;

    if (typeof email !== "string" || typeof password !== "string" || !email.trim() || !password) {
        return res.status(400).json({
            message: "Email and password are required"
        });
    }

    // `+password` re-includes the field that the schema hides by default
    const user = await User.findOne({ email: email.trim().toLowerCase() }).select("+password");

    if (!user) {
        return res.status(401).json({
            message: "Invalid email or password"
        });
    }

    const passwordMatch = await bcrypt.compare(password, user.password);

    if (!passwordMatch) {
        return res.status(401).json({
            message: "Invalid email or password"
        });
    }

    res.json({
        message: "Login successful",
        user: {
            id: user._id,
            username: user.username,
            email: user.email
        }
    });
});

app.post("/requests", (req, res) => {

    const { message, phone } = req.body;


    // Check that both fields exist

    if (!message || !phone) {
        return res.status(400).json({
            message: "Request and phone number are required"
        });
    }


    // Validate request length

    if (message.trim().length < 10) {
        return res.status(400).json({
            message: "Request must be at least 10 characters"
        });
    }


    // Validate Egyptian phone number

    const phoneRegex = /^(01)[0125][0-9]{8}$/;

    if (!phoneRegex.test(phone)) {
        return res.status(400).json({
            message: "Please provide a valid Egyptian phone number"
        });
    }


    // Create request

    const newRequest: Request = {
        id: requests.length + 1,
        message: message.trim(),
        phone: phone
    };


    requests.push(newRequest);


    // Success

    res.status(201).json({
        message: "Request submitted successfully"
    });
});

async function startServer(): Promise<void> {
    try {
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