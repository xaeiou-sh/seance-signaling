// Seance Backend Server
// Serves desktop app updates + web app
import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { swaggerUI } from '@hono/swagger-ui';
import { serveStatic } from '@hono/node-server/serve-static';
import { bodyLimit } from 'hono/body-limit';
import { readFileSync, existsSync, writeFileSync, mkdirSync, rmSync, cpSync } from 'fs';
import { join, extname } from 'path';
import { createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';
import { createHash } from 'crypto';

const app = new OpenAPIHono();

// Load configuration from config.yml
function loadConfig() {
  try {
    const configPath = join(process.cwd(), '..', 'config.yml');
    if (!existsSync(configPath)) {
      throw new Error(`config.yml not found at ${configPath}`);
    }

    const configContent = readFileSync(configPath, 'utf-8');
    const lines = configContent.split('\n');

    let inBuilderKeyHashes = false;
    const builderKeyHashes: string[] = [];

    for (const line of lines) {
      if (line.trim() === 'builder_key_hashes:') {
        inBuilderKeyHashes = true;
        continue;
      }

      if (inBuilderKeyHashes) {
        // Stop parsing if we hit a non-indented line (next section)
        if (line.length > 0 && !line.startsWith(' ') && !line.startsWith('\t')) {
          break;
        }

        // Parse array items (lines starting with "  - ")
        const match = line.match(/^\s*-\s+"?([a-f0-9]{64})"?/);
        if (match) {
          builderKeyHashes.push(match[1].trim());
        }
      }
    }

    if (builderKeyHashes.length === 0) {
      throw new Error('No builder_key_hashes found in config.yml');
    }

    return { builderKeyHashes };
  } catch (error) {
    console.error('[Config] Failed to load config.yml:', error);
    throw error;
  }
}

const config = loadConfig();
console.log(`[Config] Loaded ${config.builderKeyHashes.length} builder key hash(es)`);

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

// Health check (plain route, not OpenAPI)
app.get('/', (c) => c.text('Seance Update Server'));

// Define Zod schemas for OpenAPI
const DeployFileSchema = z.object({
  path: z.string().openapi({ example: 'releases/darwin-arm64/Seance-1.0.0-mac.zip' }),
  content: z.string().openapi({ example: 'base64-encoded-content...', description: 'Base64-encoded file content' }),
});

const DeployRequestSchema = z.object({
  files: z.array(DeployFileSchema),
  clearWeb: z.boolean().optional().openapi({ description: 'Clear web directory before deployment' }),
});

const DeployResponseSchema = z.object({
  success: z.boolean(),
  filesDeployed: z.number(),
  timestamp: z.string().openapi({ example: '2026-01-11T00:00:00.000Z' }),
});

const ErrorResponseSchema = z.object({
  error: z.string(),
  message: z.string().optional(),
});

const VersionResponseSchema = z.object({
  web: z.object({
    version: z.string(),
    deployed: z.string(),
  }),
  desktop: z.object({
    version: z.string(),
    released: z.string(),
    downloadUrl: z.string(),
  }),
});

// Define OpenAPI routes
const deployRoute = createRoute({
  method: 'post',
  path: '/deploy',
  summary: 'Deploy artifacts from CI/CD',
  description: 'Accepts deployment payloads from GitHub Actions. Requires builder API key in X-Builder-Key header.',
  request: {
    body: {
      content: {
        'application/json': {
          schema: DeployRequestSchema,
        },
      },
    },
    headers: z.object({
      'x-builder-key': z.string().openapi({ description: 'Builder API key (SHA-256 hash stored in config.yml)' }),
    }),
  },
  responses: {
    200: {
      content: {
        'application/json': {
          schema: DeployResponseSchema,
        },
      },
      description: 'Deployment successful',
    },
    401: {
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
      description: 'Missing or invalid signature',
    },
  },
});

const versionRoute = createRoute({
  method: 'get',
  path: '/updates/api/version.json',
  summary: 'Get version information',
  description: 'Returns current versions for web and desktop apps',
  responses: {
    200: {
      content: {
        'application/json': {
          schema: VersionResponseSchema,
        },
      },
      description: 'Version information',
    },
    500: {
      content: {
        'application/json': {
          schema: ErrorResponseSchema,
        },
      },
      description: 'Version data not found',
    },
  },
});

// Register OpenAPI routes
// Apply body limit middleware to deploy endpoint (500 MB for large payloads)
app.use('/deploy', bodyLimit({
  maxSize: 500 * 1024 * 1024, // 500 MB
  onError: (c) => {
    console.error('[Deploy] Payload too large');
    return c.json({ error: 'Payload too large' }, 413);
  },
}));

app.openapi(deployRoute, async (c) => {
  const builderKey = c.req.header('X-Builder-Key');

  if (!builderKey) {
    return c.json({ error: 'Missing builder key' }, 401);
  }

  // Hash the provided key and check against configured hashes
  const keyHash = createHash('sha256').update(builderKey).digest('hex');

  if (!config.builderKeyHashes.includes(keyHash)) {
    console.error('[Deploy] Invalid builder key (hash not found)');
    return c.json({ error: 'Invalid builder key' }, 401);
  }

  console.log('[Deploy] Builder key verified successfully');

  // Get raw body
  const bodyText = await c.req.text();

  try {
    // Parse body (already read as text for signature verification)
    const body = JSON.parse(bodyText);
    const { files, clearWeb } = body;

    if (!Array.isArray(files)) {
      return c.json({ error: 'Invalid request: files must be an array' }, 400);
    }

    console.log(`[Deploy] Deploying ${files.length} files`);

    // Clear web directory if requested
    if (clearWeb) {
      const webPath = join(process.cwd(), 'web');
      if (existsSync(webPath)) {
        rmSync(webPath, { recursive: true });
        console.log('[Deploy] Cleared web directory');
      }
      mkdirSync(webPath, { recursive: true });
      // Keep .gitkeep
      writeFileSync(join(webPath, '.gitkeep'), '');
    }

    // Write each file
    for (const file of files) {
      if (!file.path || !file.content) {
        console.warn('[Deploy] Skipping invalid file entry:', file);
        continue;
      }

      const fullPath = join(process.cwd(), file.path);

      // Security: prevent path traversal
      const normalizedPath = join(process.cwd(), file.path);
      if (!normalizedPath.startsWith(process.cwd())) {
        console.error('[Deploy] Path traversal attempt:', file.path);
        return c.json({ error: 'Invalid file path' }, 400);
      }

      // Create directory if needed
      const dir = join(fullPath, '..');
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }

      // Decode base64 and write file
      const content = Buffer.from(file.content, 'base64');
      writeFileSync(fullPath, content);
      console.log(`[Deploy] Wrote ${file.path} (${content.length} bytes)`);
    }

    console.log('[Deploy] Deployment complete');
    return c.json({
      success: true,
      filesDeployed: files.length,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('[Deploy] Deployment failed:', error);
    return c.json({
      error: 'Deployment failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
});

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

// Version API for web (OpenAPI route)
app.openapi(versionRoute, (c) => {
  const versionData = getVersionData();

  if (!versionData) {
    return c.json({ error: 'Version data not found' }, 500);
  }

  return c.json(versionData);
});

// Generate OpenAPI documentation
app.doc('/doc', {
  openapi: '3.0.0',
  info: {
    title: 'Seance Backend API',
    version: '1.0.0',
    description: 'Backend API for Seance desktop updates and web app hosting',
  },
  servers: [
    { url: 'http://localhost:3000', description: 'Local server' },
    { url: 'https://backend.seance.dev', description: 'Production server' },
  ],
});

// Mount Swagger UI
app.get('/ui', swaggerUI({ url: '/doc' }));

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
