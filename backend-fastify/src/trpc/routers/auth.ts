// Authentication router
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, publicProcedure, protectedProcedure } from '../trpc';
import { signToken } from '../../auth/jwt.js';
import { createUser, authenticateUser } from '../../auth/users.js';

export const authRouter = router({
  // Login endpoint
  login: publicProcedure
    .input(
      z.object({
        email: z.string().email(),
        password: z.string().min(8),
      })
    )
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
    .input(
      z.object({
        email: z.string().email(),
        password: z.string().min(8),
      })
    )
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
  me: protectedProcedure.query(({ ctx }) => {
    if (!ctx.user) {
      throw new Error('User not found in context');
    }

    return ctx.user;
  }),

  // Logout (client-side only, just returns success)
  logout: publicProcedure.mutation(() => {
    return { success: true };
  }),
});
