import "dotenv/config";
import path from "path";
import express from "express";
import bcrypt from "bcrypt";
import { connectDB } from "./config/db";

interface User {
    id: number;
    username: string;
    email: string;
    password: string;
}

const app = express();

const PORT = Number(process.env.PORT) || 3000;

const users: User[] = [];

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

app.get("/users", (req, res) => {
    res.json(users);
});

app.post("/register", async (req, res) => {
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
        return res.status(400).json({
            message: "Username, email and password are required"
        });
    }

    if (password.length < 6) {
        return res.status(400).json({
            message: "Password must be at least 6 characters"
        });
    }

    const existingUser = users.find(user => user.email === email);

    if (existingUser) {
        return res.status(400).json({
            message: "Email is already registered"
        });
    }
    const hashedPassword = await bcrypt.hash(password, 10);

    const newUser: User = {
        id: users.length + 1,
        username: username,
        email: email,
        password: hashedPassword
    };

    users.push(newUser);

res.status(201).json({
    message: "User registered successfully",
    user: {
        id: newUser.id,
        username: newUser.username,
        email: newUser.email
    }
    }); 
});

app.post("/login", async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({
            message: "Email and password are required"
        });
    }

    const user = users.find(user => user.email === email);

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
            id: user.id,
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