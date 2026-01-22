// Authentication router - Authelia integration
// Login/Register/Logout handled by Authelia UI
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure, publicProcedure } from '../trpc';

const userSchema = z.object({
  id: z.string(),
  email: z.string(),
  groups: z.array(z.string()),
});

export const authRouter = router({
  // Get current authenticated user
  me: publicProcedure
    .meta({ openapi: { method: 'GET', path: '/auth/me' } })
    .input(z.void())
    .output(userSchema.nullable())
    .query(({ ctx }) => {
      return ctx.user;
    }),

  // Logout endpoint - clears cookies via backend
  logout: publicProcedure
    .meta({ openapi: { method: 'POST', path: '/auth/logout' } })
    .input(z.void())
    .output(z.object({ success: z.boolean() }))
    .mutation(async ({ ctx }) => {
      // Clear cookies
      const host = ctx.req.get('host') || '';
      const cookieDomain = host.replace('backend.', '');

      ctx.res.clearCookie('seance_token', { domain: cookieDomain, path: '/' });
      ctx.res.clearCookie('seance_refresh_token', { domain: cookieDomain, path: '/' });

      return { success: true };
    }),
});
