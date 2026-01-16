// Main tRPC router - combines all sub-routers
import { router } from './trpc';
import { healthRouter } from './routers/health';
import { authRouter } from './routers/auth';
import { downloadsRouter } from './routers/downloads';

export const appRouter = router({
  health: healthRouter,
  auth: authRouter,
  downloads: downloadsRouter,
});

// Export type for use in frontend
export type AppRouter = typeof appRouter;
