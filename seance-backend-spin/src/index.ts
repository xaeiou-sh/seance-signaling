// Seance Backend Server
// Serves desktop app updates + web app
import { AutoRouter } from 'itty-router';
import { readFileSync, existsSync, readdirSync, statSync } from 'fs';
import { join, extname } from 'path';

const router = AutoRouter();

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
router.get('/', () => new Response('Seance Update Server'));

// Serve update manifest (JSON format for electron-updater)
router.get('/updates/darwin-arm64/RELEASES.json', () => {
  const versionData = getVersionData();

  if (!versionData) {
    return new Response('Version data not found', { status: 500 });
  }

  const manifest = {
    version: versionData.desktop.version,
    releaseDate: versionData.desktop.released,
    url: `https://backend.seance.dev/updates/releases/darwin-arm64/Seance-${versionData.desktop.version}-mac.zip`
  };

  return new Response(JSON.stringify(manifest), {
    headers: { 'Content-Type': 'application/json' }
  });
});

// Serve latest-mac.yml (YAML format for electron-updater)
router.get('/updates/darwin-arm64/latest-mac.yml', () => {
  const manifest = readReleaseFile('latest-mac.yml');

  if (!manifest) {
    return new Response('Manifest not found', { status: 404 });
  }

  return new Response(manifest, {
    headers: { 'Content-Type': 'text/yaml' }
  });
});

// Serve .zip files
router.get('/updates/releases/darwin-arm64/:filename', ({ params }) => {
  const { filename } = params;

  // Security: prevent path traversal
  if (filename.includes('..') || filename.includes('/')) {
    return new Response('Invalid filename', { status: 400 });
  }

  const fileData = readReleaseFile(`darwin-arm64/${filename}`);

  if (!fileData) {
    return new Response('File not found', { status: 404 });
  }

  return new Response(fileData, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${filename}"`
    }
  });
});

// Version API for web
router.get('/updates/api/version.json', () => {
  const versionData = getVersionData();

  if (!versionData) {
    return new Response('Version data not found', { status: 500 });
  }

  return new Response(JSON.stringify(versionData), {
    headers: { 'Content-Type': 'application/json' }
  });
});

// Helper to serve static files from web app
function serveStaticFile(filePath: string): Response | null {
  try {
    const webRoot = join(process.cwd(), 'web');
    const fullPath = join(webRoot, filePath);

    // Security: prevent path traversal
    if (!fullPath.startsWith(webRoot)) {
      return null;
    }

    if (!existsSync(fullPath)) {
      return null;
    }

    // If it's a directory, try index.html
    if (statSync(fullPath).isDirectory()) {
      const indexPath = join(fullPath, 'index.html');
      if (existsSync(indexPath)) {
        const content = readFileSync(indexPath);
        return new Response(content, {
          headers: { 'Content-Type': 'text/html' }
        });
      }
      return null;
    }

    const content = readFileSync(fullPath);
    const ext = extname(fullPath);
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    return new Response(content, {
      headers: { 'Content-Type': contentType }
    });
  } catch (error) {
    console.error('[Static File] Error serving:', filePath, error);
    return null;
  }
}

// Serve web app static files
router.get('/*', ({ url }) => {
  const path = new URL(url).pathname;

  // Try to serve the exact file
  let response = serveStaticFile(path);
  if (response) return response;

  // SPA fallback: serve index.html for client-side routing
  // (but not for API routes or file extensions)
  if (!path.startsWith('/updates') && !extname(path)) {
    response = serveStaticFile('/index.html');
    if (response) return response;
  }

  return new Response('Not found', { status: 404 });
});

// @ts-ignore
addEventListener('fetch', (event: FetchEvent) => {
  event.respondWith(router.fetch(event.request));
});
