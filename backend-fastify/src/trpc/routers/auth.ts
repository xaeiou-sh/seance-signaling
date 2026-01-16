// Authentication router
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, publicProcedure, protectedProcedure } from '../trpc';
import { signToken } from '../../auth/jwt.js';
import { createUser, authenticateUser } from '../../auth/users.js';

const authResponseSchema = z.object({
  success: z.boolean(),
  token: z.string(),
  user: z.object({
    id: z.string(),
    email: z.string(),
  }),
});

const userSchema = z.object({
  id: z.string(),
  email: z.string(),
});

export const authRouter = router({
  // Login endpoint
  login: publicProcedure
    .meta({ openapi: { method: 'POST', path: '/auth/login' } })
    .input(
      z.object({
        email: z.string().email(),
        password: z.string().min(8),
      })
    )
    .output(authResponseSchema)
    .mutation(async ({ input }) => {
      const user = authenticateUser(input.email, input.password);

      if (!user) {
        throw new TRPCError({
          code: 'UNAUTHORIZED',
          message: 'Invalid email or password',
        });
      }

      // Sign JWT token
      const token = signToken({
        userId: user.id,
        email: user.email,
      });

      return {
        success: true,
        token,
        user: {
          id: user.id,
          email: user.email,
        },
      };
    }),

  // Register endpoint
  register: publicProcedure
    .meta({ openapi: { method: 'POST', path: '/auth/register' } })
    .input(
      z.object({
        email: z.string().email(),
        password: z.string().min(8),
      })
    )
    .output(authResponseSchema)
    .mutation(async ({ input }) => {
      try {
        const user = createUser(input.email, input.password);

        // Sign JWT token
        const token = signToken({
          userId: user.id,
          email: user.email,
        });

        return {
          success: true,
          token,
          user: {
            id: user.id,
            email: user.email,
          },
        };
      } catch (error) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: error instanceof Error ? error.message : 'Registration failed',
        });
      }
    }),

  // Get current user (protected endpoint)
  me: protectedProcedure
    .meta({ openapi: { method: 'GET', path: '/auth/me', protect: true } })
    .input(z.void())
    .output(userSchema)
    .query(({ ctx }) => {
      if (!ctx.user) {
        throw new Error('User not found in context');
      }

      return ctx.user;
    }),

  // Logout (client-side only, just returns success)
  logout: publicProcedure
    .meta({ openapi: { method: 'POST', path: '/auth/logout' } })
    .input(z.void())
    .output(z.object({ success: z.boolean() }))
    .mutation(() => {
      return { success: true };
    }),
});
