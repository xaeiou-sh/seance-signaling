// tRPC initialization and procedure definitions
import { initTRPC, TRPCError } from '@trpc/server';
import type { Context } from './context';

const t = initTRPC.context<Context>().create();

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

// Protected procedure that requires authentication
export const protectedProcedure = t.procedure.use(isAuthed);
