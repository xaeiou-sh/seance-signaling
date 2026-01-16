// Health check router
import { z } from 'zod';
import { router, publicProcedure } from '../trpc';

export const healthRouter = router({
  // Simple ping endpoint
  ping: publicProcedure.query(() => {
    return { message: 'pong', timestamp: new Date().toISOString() };
  }),

  // Echo endpoint to test input validation
  echo: publicProcedure
    .input(z.object({ message: z.string() }))
    .query(({ input }) => {
      return { echo: input.message };
    }),
});
