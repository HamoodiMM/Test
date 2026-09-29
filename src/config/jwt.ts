// How long a login token stays valid. After this, the user must log in again.
export const JWT_EXPIRES_IN = "1h";

export function getJwtSecret(): string {
    const secret = process.env.JWT_SECRET;

    if (!secret) {
        throw new Error("JWT_SECRET is not defined in .env");
    }

    return secret;
}
