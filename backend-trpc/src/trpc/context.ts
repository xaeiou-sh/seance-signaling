// tRPC context - shared state available to all procedures
import type { CreateExpressContextOptions } from '@trpc/server/adapters/express';

// ARCHIVED: Authentication temporarily disabled
// Self-hosted auth moved to /archive directory
// User tracking will be migrated to Stripe-based system

// Context that will be available to all tRPC procedures
export async function createContext({ req, res }: CreateExpressContextOptions) {
  // Authentication disabled - no user validation
  const user = null;

  return {
    req,
    res,
    user,
  };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
