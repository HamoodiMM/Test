import type { Request } from 'express';

// What AuthService puts inside the JWT when a user logs in
export interface AuthUser {
  userId: string;
  username: string;
}

// An HTTP request after AuthGuard has verified the token and attached the user
export interface AuthenticatedRequest extends Request {
  user: AuthUser;
}
