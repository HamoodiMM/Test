import type { Request } from 'express';

// What the Express app puts inside the JWT when a user logs in
export interface AuthUser {
  userId: string;
  username: string;
}

// An Express request after AuthGuard has verified the token
export interface AuthenticatedRequest extends Request {
  user: AuthUser;
}
