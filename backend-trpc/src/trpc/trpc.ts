// tRPC initialization and procedure definitions
import { initTRPC } from '@trpc/server';
import type { OpenApiMeta } from 'trpc-to-openapi';
import type { Context } from './context';

const t = initTRPC.meta<OpenApiMeta>().context<Context>().create();

// Base router and procedure
export const router = t.router;
export const publicProcedure = t.procedure;

// ARCHIVED: Authentication temporarily disabled
// Self-hosted auth moved to /archive directory
// These procedures are now equivalent to publicProcedure until auth is reimplemented

// Stubbed auth middleware - always allows access (no auth enforcement)
const isAuthed = t.middleware(({ ctx, next }) => {
  // Auth disabled - always allow access
  return next({ ctx });
});

// Stubbed admin middleware - always allows access (no auth enforcement)
const isAdmin = t.middleware(({ ctx, next }) => {
  // Auth disabled - always allow access
  return next({ ctx });
});

// Protected procedure (currently no protection - auth disabled)
export const protectedProcedure = t.procedure.use(isAuthed);

// Admin procedure (currently no protection - auth disabled)
export const adminProcedure = t.procedure.use(isAdmin);
