// tRPC context - shared state available to all procedures
import type { CreateExpressContextOptions } from '@trpc/server/adapters/express';
import { validateSession } from '../auth/session.js';

// Context that will be available to all tRPC procedures
export async function createContext({ req, res }: CreateExpressContextOptions) {
  // Extract access token from Authorization header or cookie
  let accessToken: string | undefined;

  // Try Authorization header first (Bearer token)
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    accessToken = authHeader.substring(7);
  }

  // Fallback to cookie (for browser requests)
  if (!accessToken) {
    accessToken = req.cookies['seance_token'];
  }

  if (accessToken) {
    console.log('[Context] Found access token, validating...');
  } else {
    console.log('[Context] No access token found in cookies or headers');
    console.log('[Context] Cookies:', Object.keys(req.cookies));
  }

  // Validate token and get user info
  const user = await validateSession(accessToken);

  if (user) {
    console.log('[Context] User authenticated:', user.email);
  } else {
    console.log('[Context] No user authenticated');
  }

  return {
    req,
    res,
    user,
  };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
