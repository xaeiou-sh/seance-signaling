// tRPC context - shared state available to all procedures
import type { CreateExpressContextOptions } from '@trpc/server/adapters/express';
import { extractTokenFromHeader, verifyToken } from '../auth/jwt.js';
import { findUserById } from '../auth/users.js';

// Context that will be available to all tRPC procedures
export function createContext({ req, res }: CreateExpressContextOptions) {
  // Try to get user from JWT token
  const authHeader = req.headers.authorization as string | undefined;
  const token = extractTokenFromHeader(authHeader);

  let user: { id: string; email: string } | null = null;

  if (token) {
    const payload = verifyToken(token);
    if (payload) {
      // Verify user still exists
      const dbUser = findUserById(payload.userId);
      if (dbUser) {
        user = {
          id: dbUser.id,
          email: dbUser.email,
        };
      }
    }
  }

  return {
    req,
    res,
    user,
  };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
