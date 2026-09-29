import { Request, Response } from "express";
import { User } from "../models/User";

// GET /users (protected)
// Password is excluded automatically because of `select: false` in the User schema
export async function getUsers(req: Request, res: Response): Promise<void> {
    const users = await User.find();
    res.json(users);
}

// GET /profile (protected): returns the account of whoever owns the token
export async function getProfile(req: Request, res: Response): Promise<void> {
    if (!req.user) {
        res.status(401).json({ message: "Not authenticated" });
        return;
    }

    const user = await User.findById(req.user.userId);

    // Token is valid, but the account was deleted after it was issued
    if (!user) {
        res.status(404).json({ message: "User not found" });
        return;
    }

    res.json({
        user: {
            id: user._id,
            username: user.username,
            email: user.email
        }
    });
}
