import { z } from "zod";

// Egyptian mobile: 010, 011, 012 or 015 followed by 8 digits
export const EGYPT_PHONE_REGEX = /^01[0125][0-9]{8}$/;

export const guestRequestSchema = z.object(
    {
        message: z
            .string({ error: "Message is required" })
            .trim()
            .min(10, "Request must be at least 10 characters")
            .max(1000, "Request must be at most 1000 characters"),

        phone: z
            .string({ error: "Phone number is required" })
            .trim()
            .regex(EGYPT_PHONE_REGEX, "Please provide a valid Egyptian phone number")
    },
    { error: "Request body must be a JSON object" }
);

export type GuestRequestInput = z.infer<typeof guestRequestSchema>;
