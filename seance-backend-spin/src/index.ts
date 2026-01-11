// Seance Backend Server
// Serves desktop app updates + web app
import { Hono } from 'hono';
import { serveStatic } from '@hono/node-server/serve-static';
import { readFileSync, existsSync } from 'fs';
import { join, extname } from 'path';

const app = new Hono();

// MIME type mapping for static files
const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.eot': 'application/vnd.ms-fontobject',
};

// Helper to read version.json
function getVersionData() {
  try {
    const versionPath = join(process.cwd(), 'releases', 'version.json');
    if (!existsSync(versionPath)) {
      throw new Error(`version.json not found at ${versionPath}`);
    }
    const data = readFileSync(versionPath, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    console.error('[Update Server] Failed to read version.json:', error);
    return null;
  }
}

// Helper to read file from releases directory
function readReleaseFile(filePath: string): Buffer | null {
  try {
    const fullPath = join(process.cwd(), 'releases', filePath);
    if (!existsSync(fullPath)) {
      return null;
    }
    return readFileSync(fullPath);
  } catch (error) {
    console.error(`[Update Server] Failed to read file ${filePath}:`, error);
    return null;
  }
}

// Health check
app.get('/', (c) => c.text('Seance Update Server'));

// Serve update manifest (JSON format for electron-updater)
app.get('/updates/darwin-arm64/RELEASES.json', (c) => {
  const versionData = getVersionData();

  if (!versionData) {
    return c.json({ error: 'Version data not found' }, 500);
  }

  const manifest = {
    version: versionData.desktop.version,
    releaseDate: versionData.desktop.released,
    url: `https://backend.seance.dev/updates/releases/darwin-arm64/Seance-${versionData.desktop.version}-mac.zip`
  };

  return c.json(manifest);
});

// Serve latest-mac.yml (YAML format for electron-updater)
app.get('/updates/darwin-arm64/latest-mac.yml', (c) => {
  const manifest = readReleaseFile('darwin-arm64/latest-mac.yml');

  if (!manifest) {
    return c.text('Manifest not found', 404);
  }

  return c.body(manifest, 200, { 'Content-Type': 'text/yaml' });
});

// Serve .zip files
app.get('/updates/releases/darwin-arm64/:filename', (c) => {
  const filename = c.req.param('filename');

  // Security: prevent path traversal
  if (filename.includes('..') || filename.includes('/')) {
    return c.text('Invalid filename', 400);
  }

  const fileData = readReleaseFile(`darwin-arm64/${filename}`);

  if (!fileData) {
    return c.text('File not found', 404);
  }

  return c.body(fileData, 200, {
    'Content-Type': 'application/zip',
    'Content-Disposition': `attachment; filename="${filename}"`
  });
});

// Version API for web
app.get('/updates/api/version.json', (c) => {
  const versionData = getVersionData();

  if (!versionData) {
    return c.json({ error: 'Version data not found' }, 500);
  }

  return c.json(versionData);
});

// Serve static files from web/ directory with SPA fallback
app.use('/*', serveStatic({ root: './web' }));

// SPA fallback - serve index.html for client-side routing
app.get('/*', (c) => {
  const path = c.req.path;

  // Don't apply SPA fallback to API routes
  if (path.startsWith('/updates')) {
    return c.text('Not found', 404);
  }

  // Serve index.html for SPA routes (no file extension)
  if (!extname(path)) {
    try {
      const indexPath = join(process.cwd(), 'web', 'index.html');
      if (existsSync(indexPath)) {
        const content = readFileSync(indexPath);
        return c.html(content.toString());
      }
    } catch (error) {
      console.error('[Static File] Error serving index.html:', error);
    }
  }

  return c.text('Not found', 404);
});

// Start server
const port = process.env.PORT || 3000;

export default app;

// For Node.js runtime
if (import.meta.url === `file://${process.argv[1]}`) {
  const { serve } = await import('@hono/node-server');

  console.log(`🔮 Seance Update Server starting on port ${port}`);
  console.log(`   Health: http://localhost:${port}/`);
  console.log(`   Updates: http://localhost:${port}/updates/`);

  serve({
    fetch: app.fetch,
    port: Number(port),
  });
}
