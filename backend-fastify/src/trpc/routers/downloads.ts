// Downloads router - will protect these endpoints with auth + Stripe checks
import { router, publicProcedure } from '../trpc';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

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
  getLatest: publicProcedure.query(() => {
    const versionData = getVersionData();

    if (!versionData) {
      throw new Error('Version data not found');
    }

    return {
      version: versionData.desktop.version,
      released: versionData.desktop.released,
      downloadUrl: versionData.desktop.downloadUrl,
      // TODO: Add file size and checksums
    };
  }),

  // Check if user can download (will add auth + Stripe subscription check later)
  canDownload: publicProcedure.query(() => {
    // For now, everyone can download
    // TODO: Check if user has active subscription
    return {
      canDownload: true,
      reason: null as string | null,
    };
  }),
});
