import { Request, Response } from "express";
import { GuestRequest } from "../models/GuestRequest";
import { guestRequestSchema } from "../validation/guestRequest.schemas";

// POST /requests
export async function createGuestRequest(req: Request, res: Response): Promise<void> {
    // Validate message length and Egyptian phone format
    const result = guestRequestSchema.safeParse(req.body);

    if (!result.success) {
        res.status(400).json({ message: result.error.issues[0].message });
        return;
    }

    // Save request to MongoDB (values are already trimmed by the schema)
    await GuestRequest.create(result.data);

    res.status(201).json({ message: "Request submitted successfully" });
}
