// tRPC initialization and procedure definitions
import { initTRPC, TRPCError } from '@trpc/server';
import type { OpenApiMeta } from 'trpc-to-openapi';
import type { Context } from './context';

const t = initTRPC.meta<OpenApiMeta>().context<Context>().create();

// Base router and procedure
export const router = t.router;
export const publicProcedure = t.procedure;

// Middleware to check if user is authenticated
const isAuthed = t.middleware(({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Not authenticated' });
  }
  return next({
    ctx: {
      ...ctx,
      user: ctx.user, // Now TypeScript knows user is not null
    },
  });
});

// Middleware to check if user is an admin
const isAdmin = t.middleware(({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Not authenticated' });
  }
  if (!ctx.user.groups.includes('admins')) {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Admin access required' });
  }
  return next({
    ctx: {
      ...ctx,
      user: ctx.user,
    },
  });
});

// Protected procedure that requires authentication
export const protectedProcedure = t.procedure.use(isAuthed);

// Admin procedure that requires admin group membership
export const adminProcedure = t.procedure.use(isAdmin);
