// Stripe integration - Donation tier for prebuilt binaries
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import Stripe from 'stripe';
import { router, protectedProcedure } from '../trpc.js';
import { getSubscription } from '../../stripe/subscription-storage.js';

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error('STRIPE_SECRET_KEY environment variable is required');
}

if (!process.env.STRIPE_PRICE_ID) {
  throw new Error('STRIPE_PRICE_ID environment variable is required');
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2024-12-18.acacia',
});

const PRICE_ID = process.env.STRIPE_PRICE_ID;

export const stripeRouter = router({
  // Get current user's subscription status
  getSubscriptionStatus: protectedProcedure
    .meta({ openapi: { method: 'GET', path: '/stripe/subscription' } })
    .input(z.void())
    .output(z.object({
      hasSubscription: z.boolean(),
      status: z.enum(['active', 'canceled', 'past_due', 'incomplete', 'trialing']).nullable(),
      currentPeriodEnd: z.number().nullable(),
      cancelAtPeriodEnd: z.boolean().nullable(),
    }))
    .query(async ({ ctx }) => {
      if (!ctx.user) {
        throw new TRPCError({ code: 'UNAUTHORIZED' });
      }

      const subscription = await getSubscription(ctx.user.email);

      if (!subscription) {
        return {
          hasSubscription: false,
          status: null,
          currentPeriodEnd: null,
          cancelAtPeriodEnd: null,
        };
      }

      return {
        hasSubscription: true,
        status: subscription.status,
        currentPeriodEnd: subscription.currentPeriodEnd,
        cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
      };
    }),

  // Create Stripe checkout session for $5/month subscription
  createCheckoutSession: protectedProcedure
    .meta({ openapi: { method: 'POST', path: '/stripe/checkout' } })
    .input(z.object({
      successUrl: z.string().url(),
      cancelUrl: z.string().url(),
    }))
    .output(z.object({
      sessionId: z.string(),
      url: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user) {
        throw new TRPCError({ code: 'UNAUTHORIZED' });
      }

      try {
        // Create Stripe checkout session
        const session = await stripe.checkout.sessions.create({
          mode: 'subscription',
          customer_email: ctx.user.email,
          line_items: [
            {
              price: PRICE_ID,
              quantity: 1,
            },
          ],
          success_url: input.successUrl,
          cancel_url: input.cancelUrl,
          metadata: {
            userId: ctx.user.id,
            userEmail: ctx.user.email,
          },
        });

        if (!session.url) {
          throw new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message: 'Failed to create checkout session'
          });
        }

        return {
          sessionId: session.id,
          url: session.url,
        };
      } catch (error) {
        console.error('Stripe checkout error:', error);
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to create checkout session',
        });
      }
    }),

  // Create customer portal session for managing subscription
  createPortalSession: protectedProcedure
    .meta({ openapi: { method: 'POST', path: '/stripe/portal' } })
    .input(z.object({
      returnUrl: z.string().url(),
    }))
    .output(z.object({
      url: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user) {
        throw new TRPCError({ code: 'UNAUTHORIZED' });
      }

      try {
        // Find customer by email
        const customers = await stripe.customers.list({
          email: ctx.user.email,
          limit: 1,
        });

        if (customers.data.length === 0) {
          throw new TRPCError({
            code: 'NOT_FOUND',
            message: 'No subscription found',
          });
        }

        // Create portal session
        const session = await stripe.billingPortal.sessions.create({
          customer: customers.data[0].id,
          return_url: input.returnUrl,
        });

        return {
          url: session.url,
        };
      } catch (error) {
        console.error('Stripe portal error:', error);

        if (error instanceof TRPCError) {
          throw error;
        }

        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Failed to create portal session',
        });
      }
    }),
});
