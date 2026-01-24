// Main tRPC router - combines all sub-routers
import { router } from './trpc';
import { healthRouter } from './routers/health';
// ARCHIVED: Auth router moved to /archive
// import { authRouter } from './routers/auth';
import { downloadsRouter } from './routers/downloads';
import { stripeRouter } from './routers/stripe';

export const appRouter = router({
  health: healthRouter,
  // auth: authRouter, // ARCHIVED: Auth disabled
  downloads: downloadsRouter,
  stripe: stripeRouter,
});

// Export type for use in frontend
export type AppRouter = typeof appRouter;
