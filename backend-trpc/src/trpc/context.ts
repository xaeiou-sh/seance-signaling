// tRPC context - shared state available to all procedures
import type { CreateExpressContextOptions } from '@trpc/server/adapters/express';
import { validateSession } from '../auth/session.js';

// Context that will be available to all tRPC procedures
export async function createContext({ req, res }: CreateExpressContextOptions) {
  // Get Authelia session cookie
  const sessionId = req.cookies['seance_session'];

  // Validate session and get user info from Redis
  const user = await validateSession(sessionId);

  return {
    req,
    res,
    user,
  };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
