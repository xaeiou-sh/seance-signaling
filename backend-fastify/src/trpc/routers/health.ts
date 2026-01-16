// Health check router
import { z } from 'zod';
import { router, publicProcedure } from '../trpc';

export const healthRouter = router({
  // Simple ping endpoint
  ping: publicProcedure
    .meta({ openapi: { method: 'GET', path: '/health/ping' } })
    .input(z.void())
    .output(z.object({
      message: z.string(),
      timestamp: z.string()
    }))
    .query(() => {
      return { message: 'pong', timestamp: new Date().toISOString() };
    }),

  // Echo endpoint to test input validation
  echo: publicProcedure
    .meta({ openapi: { method: 'GET', path: '/health/echo' } })
    .input(z.object({ message: z.string() }))
    .output(z.object({ echo: z.string() }))
    .query(({ input }) => {
      return { echo: input.message };
    }),
});
