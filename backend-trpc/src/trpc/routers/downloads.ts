// Downloads router for prebuilt binaries
// ARCHIVED: Auth is disabled, so download checking is disabled
import { router, publicProcedure } from '../trpc';
import { z } from 'zod';

export const downloadsRouter = router({
  // List available downloads - public access (auth disabled)
  list: publicProcedure
    .input(z.void())
    .output(z.array(z.object({
      id: z.string(),
      platform: z.string(),
      arch: z.string(),
      version: z.string(),
      filename: z.string(),
      size: z.number(),
      url: z.string(),
    })))
    .query(async () => {
      // Return empty list - downloads require auth which is disabled
      return [];
    }),
});
