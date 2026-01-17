// Downloads router - Protected endpoints requiring active subscription
import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, publicProcedure, protectedProcedure } from '../trpc';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { hasActiveSubscription } from '../../stripe/subscription-storage.js';

// Helper to read version.json
function getVersionData() {
  try {
    const versionPath = join(process.cwd(), 'releases', 'version.json');
    if (!existsSync(versionPath)) {
      return null;
    }
    const data = readFileSync(versionPath, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    console.error('[Downloads] Failed to read version.json:', error);
    return null;
  }
}

export const downloadsRouter = router({
  // Get latest version info
  getLatest: publicProcedure
    .meta({ openapi: { method: 'GET', path: '/downloads/latest' } })
    .input(z.void())
    .output(
      z.object({
        version: z.string(),
        released: z.string(),
        downloadUrl: z.string(),
      })
    )
    .query(() => {
      const versionData = getVersionData();

      if (!versionData) {
        throw new Error('Version data not found');
      }

      return {
        version: versionData.desktop.version,
        released: versionData.desktop.released,
        downloadUrl: versionData.desktop.downloadUrl,
      };
    }),

  // Get protected download URL (requires active subscription)
  getProtectedDownload: protectedProcedure
    .meta({ openapi: { method: 'GET', path: '/downloads/protected' } })
    .input(z.void())
    .output(
      z.object({
        version: z.string(),
        released: z.string(),
        downloadUrl: z.string(),
      })
    )
    .query(async ({ ctx }) => {
      if (!ctx.user) {
        throw new TRPCError({ code: 'UNAUTHORIZED', message: 'Authentication required' });
      }

      // Check if user has active subscription
      const hasSubscription = await hasActiveSubscription(ctx.user.email);

      if (!hasSubscription) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Active subscription required to download prebuilt binaries',
        });
      }

      const versionData = getVersionData();

      if (!versionData) {
        throw new TRPCError({
          code: 'INTERNAL_SERVER_ERROR',
          message: 'Version data not found',
        });
      }

      return {
        version: versionData.desktop.version,
        released: versionData.desktop.released,
        downloadUrl: versionData.desktop.downloadUrl,
      };
    }),
});
