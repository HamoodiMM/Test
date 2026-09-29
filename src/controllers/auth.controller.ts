import { Request, Response } from "express";
import bcrypt from "bcrypt";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import { User } from "../models/User";
import { registerSchema, loginSchema } from "../validation/auth.schemas";
import { getJwtSecret, JWT_EXPIRES_IN } from "../config/jwt";

// POST /register
export async function register(req: Request, res: Response): Promise<void> {
    // Runtime validation: req.body comes from the client and can contain anything
    const result = registerSchema.safeParse(req.body);

    if (!result.success) {
        res.status(400).json({ message: result.error.issues[0].message });
        return;
    }

    // result.data is typed as RegisterInput, already trimmed and lowercased
    const { username, email, password } = result.data;

    try {
        const existingUser = await User.findOne({ email: email });

        if (existingUser) {
            res.status(409).json({ message: "Email is already registered" });
            return;
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const newUser = await User.create({
            username: username,
            email: email,
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
            res.status(400).json({ message: firstError.message });
            return;
        }

        // Unique index violation: two registrations with the same email at the same moment
        if ((error as { code?: number }).code === 11000) {
            res.status(409).json({ message: "Email is already registered" });
            return;
        }

        // Anything else is unexpected: let the global error handler deal with it
        throw error;
    }
}

// POST /login
export async function login(req: Request, res: Response): Promise<void> {
    const result = loginSchema.safeParse(req.body);

    if (!result.success) {
        res.status(400).json({ message: result.error.issues[0].message });
        return;
    }

    const { email, password } = result.data;

    // `+password` re-includes the field that the schema hides by default
    const user = await User.findOne({ email: email }).select("+password");

    if (!user) {
        res.status(401).json({ message: "Invalid email or password" });
        return;
    }

    const passwordMatch = await bcrypt.compare(password, user.password);

    if (!passwordMatch) {
        res.status(401).json({ message: "Invalid email or password" });
        return;
    }

    const token = jwt.sign(
        { userId: user._id.toString() },
        getJwtSecret(),
        { expiresIn: JWT_EXPIRES_IN }
    );

    res.json({
        message: "Login successful",
        token: token,
        user: {
            id: user._id,
            username: user.username,
            email: user.email
        }
    });
}
