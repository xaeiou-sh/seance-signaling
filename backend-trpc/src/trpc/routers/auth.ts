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
  // Get current authenticated user from Authelia headers
  // Protected routes are enforced by Caddy forward_auth
  me: publicProcedure
    .meta({ openapi: { method: 'GET', path: '/auth/me' } })
    .input(z.void())
    .output(userSchema.nullable())
    .query(({ ctx }) => {
      // Return user from Authelia headers or null if not authenticated
      return ctx.user;
    }),
});
