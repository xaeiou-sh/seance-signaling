// Stripe subscription management router
// ARCHIVED: Auth is disabled, so these endpoints are stubbed
import { router, publicProcedure } from '../trpc';
import { z } from 'zod';

export const stripeRouter = router({
  // Stubbed - auth required but disabled
  getSubscriptionStatus: publicProcedure
    .input(z.void())
    .output(z.object({
      hasSubscription: z.boolean(),
      status: z.enum(['active', 'canceled', 'past_due', 'incomplete', 'trialing']).nullable(),
      currentPeriodEnd: z.number().nullable(),
      cancelAtPeriodEnd: z.boolean().nullable(),
    }))
    .query(async () => {
      return {
        hasSubscription: false,
        status: null,
        currentPeriodEnd: null,
        cancelAtPeriodEnd: null,
      };
    }),

  // Stubbed - auth required but disabled
  createCheckoutSession: publicProcedure
    .input(z.object({
      successUrl: z.string().url(),
      cancelUrl: z.string().url(),
    }))
    .output(z.object({
      sessionId: z.string(),
      url: z.string(),
    }))
    .mutation(async () => {
      throw new Error('Auth required - stripe endpoints disabled');
    }),

  // Stubbed - auth required but disabled
  createPortalSession: publicProcedure
    .input(z.object({
      returnUrl: z.string().url(),
    }))
    .output(z.object({
      url: z.string(),
    }))
    .mutation(async () => {
      throw new Error('Auth required - stripe endpoints disabled');
    }),
});
