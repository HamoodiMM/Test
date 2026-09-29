import { z } from "zod";

// Reusable pieces
const emailField = z
    .string({ error: "Email is required" })
    .trim()
    .toLowerCase()
    .pipe(z.email("Please provide a valid email address"));

export const registerSchema = z.object(
    {
        username: z
            .string({ error: "Username is required" })
            .trim()
            .min(3, "Username must be at least 3 characters")
            .max(30, "Username must be at most 30 characters"),

        email: emailField,

        // bcrypt only uses the first 72 bytes of a password, so longer ones are rejected
        password: z
            .string({ error: "Password is required" })
            .min(8, "Password must be at least 8 characters")
            .max(72, "Password must be at most 72 characters")
            .regex(/[A-Za-z]/, "Password must contain at least one letter")
            .regex(/[0-9]/, "Password must contain at least one number")
    },
    { error: "Request body must be a JSON object" }
);

export const loginSchema = z.object(
    {
        email: emailField,
        password: z.string({ error: "Password is required" }).min(1, "Password is required")
    },
    { error: "Request body must be a JSON object" }
);

// TypeScript types generated from the schemas, so they can never drift apart
export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
