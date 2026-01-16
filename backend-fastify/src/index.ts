// Seance Backend Server
// Serves desktop app updates + web app
import Fastify from 'fastify';
import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUI from '@fastify/swagger-ui';
import fastifyStatic from '@fastify/static';
import { Type } from '@sinclair/typebox';
import { readFileSync, existsSync, writeFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { createHash } from 'crypto';
import { registerTRPC } from './trpc/adapter.js';
import { appRouter } from './trpc/router.js';

const app = Fastify({
  logger: true,
  bodyLimit: 500 * 1024 * 1024, // 500 MB for large deployments
});

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
        if (line.length > 0 && !line.startsWith(' ') && !line.startsWith('\t')) {
          break;
        }

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

// Register Swagger/OpenAPI
await app.register(fastifySwagger, {
  openapi: {
    info: {
      title: 'Seance Backend API',
      description: 'Backend API for Seance desktop updates and web app hosting',
      version: '1.0.0',
    },
    servers: [
      { url: 'http://localhost:3000', description: 'Local server' },
      { url: 'https://backend.seance.dev', description: 'Production server' },
    ],
  },
});

await app.register(fastifySwaggerUI, {
  routePrefix: '/ui',
});

// Register tRPC
registerTRPC(app, {
  router: appRouter,
  prefix: '/trpc',
});

console.log('[tRPC] Registered at /trpc');

// TypeBox schemas
const DeployFileSchema = Type.Object({
  path: Type.String({ examples: ['releases/darwin-arm64/Seance-1.0.0-mac.dmg'] }),
  content: Type.String({ description: 'Base64-encoded file content' }),
});

const DeployRequestSchema = Type.Object({
  files: Type.Array(DeployFileSchema),
  clearWeb: Type.Optional(Type.Boolean({ description: 'Clear web directory before deployment' })),
});

const DeployResponseSchema = Type.Object({
  success: Type.Boolean(),
  filesDeployed: Type.Number(),
  timestamp: Type.String({ examples: ['2026-01-11T00:00:00.000Z'] }),
});

const ErrorResponseSchema = Type.Object({
  error: Type.String(),
  message: Type.Optional(Type.String()),
});

const VersionResponseSchema = Type.Object({
  web: Type.Object({
    version: Type.String(),
    deployed: Type.String(),
  }),
  desktop: Type.Object({
    version: Type.String(),
    released: Type.String(),
    downloadUrl: Type.String(),
  }),
});

const ReleasesJsonSchema = Type.Object({
  version: Type.String({ examples: ['2026.01.000'] }),
  releaseDate: Type.String({ examples: ['2026-01-11T00:00:00.000Z'] }),
  url: Type.String({ examples: ['https://backend.seance.dev/updates/releases/darwin-arm64/Seance-2026.01.000-mac.dmg'] }),
});

// Deploy endpoint
app.post('/deploy', {
  schema: {
    description: 'Deploy artifacts from CI/CD',
    summary: 'Deploy artifacts from GitHub Actions',
    headers: Type.Object({
      'x-builder-key': Type.String({ description: 'Builder API key (SHA-256 hash stored in config.yml)' }),
    }),
    body: DeployRequestSchema,
    response: {
      200: DeployResponseSchema,
      401: ErrorResponseSchema,
      400: ErrorResponseSchema,
      500: ErrorResponseSchema,
    },
  },
}, async (request, reply) => {
  const builderKey = request.headers['x-builder-key'] as string | undefined;

  if (!builderKey) {
    reply.code(401).send({ error: 'Missing builder key' });
    return;
  }

  // Hash the provided key and check against configured hashes
  const keyHash = createHash('sha256').update(builderKey).digest('hex');

  if (!config.builderKeyHashes.includes(keyHash)) {
    console.error('[Deploy] Invalid builder key (hash not found)');
    reply.code(401).send({ error: 'Invalid builder key' });
    return;
  }

  console.log('[Deploy] Builder key verified successfully');

  try {
    const body = request.body as { files: Array<{ path: string; content: string }>; clearWeb?: boolean };
    const { files, clearWeb } = body;

    console.log(`[Deploy] Deploying ${files.length} files`);

    // Clear web directory if requested
    if (clearWeb) {
      const webPath = join(process.cwd(), 'web');
      if (existsSync(webPath)) {
        rmSync(webPath, { recursive: true });
        console.log('[Deploy] Cleared web directory');
      }
      mkdirSync(webPath, { recursive: true });
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
        reply.code(400).send({ error: 'Invalid file path' });
        return;
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
    reply.send({
      success: true,
      filesDeployed: files.length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('[Deploy] Deployment failed:', error);
    reply.code(500).send({
      error: 'Deployment failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Version API
app.get('/updates/api/version.json', {
  schema: {
    description: 'Get version information',
    summary: 'Returns current versions for web and desktop apps',
    response: {
      200: VersionResponseSchema,
      500: ErrorResponseSchema,
    },
  },
}, async (request, reply) => {
  const versionData = getVersionData();

  if (!versionData) {
    reply.code(500).send({ error: 'Version data not found' });
    return;
  }

  reply.send(versionData);
});

// Serve update manifest (JSON format for electron-updater)
app.get('/updates/darwin-arm64/RELEASES.json', {
  schema: {
    description: 'Get release manifest (JSON)',
    summary: 'Returns JSON manifest for electron-updater',
    response: {
      200: ReleasesJsonSchema,
      500: ErrorResponseSchema,
    },
  },
}, async (request, reply) => {
  const versionData = getVersionData();

  if (!versionData) {
    reply.code(500).send({ error: 'Version data not found' });
    return;
  }

  const manifest = {
    version: versionData.desktop.version,
    releaseDate: versionData.desktop.released,
    url: `https://backend.seance.dev/updates/releases/darwin-arm64/Seance-${versionData.desktop.version}-mac.dmg`
  };

  reply.send(manifest);
});

// Serve latest-mac.yml (YAML format for electron-updater)
app.get('/updates/darwin-arm64/latest-mac.yml', {
  schema: {
    description: 'Get release manifest (YAML)',
    summary: 'Returns YAML manifest for electron-updater',
    response: {
      200: Type.String({ contentMediaType: 'text/yaml' }),
      404: Type.String(),
    },
  },
}, async (request, reply) => {
  const manifest = readReleaseFile('darwin-arm64/latest-mac.yml');

  if (!manifest) {
    reply.code(404).send('Manifest not found');
    return;
  }

  reply.type('text/yaml').send(manifest);
});

// Serve .dmg files
app.get('/updates/releases/darwin-arm64/:filename', {
  schema: {
    description: 'Download specific release file',
    summary: 'Downloads a specific version of the desktop app',
    params: Type.Object({
      filename: Type.String({ examples: ['Seance-2026.01.000-mac.dmg'] }),
    }),
    response: {
      200: Type.String({ contentMediaType: 'application/x-apple-diskimage' }),
      400: Type.String(),
      404: Type.String(),
    },
  },
}, async (request, reply) => {
  const { filename } = request.params as { filename: string };

  // Security: prevent path traversal
  if (filename.includes('..') || filename.includes('/')) {
    reply.code(400).send('Invalid filename');
    return;
  }

  const fileData = readReleaseFile(`darwin-arm64/${filename}`);

  if (!fileData) {
    reply.code(404).send('File not found');
    return;
  }

  reply
    .type('application/x-apple-diskimage')
    .header('Content-Disposition', `attachment; filename="${filename}"`)
    .send(fileData);
});

// Download latest version with proper filename
app.get('/updates/darwin-arm64/download-latest', {
  schema: {
    description: 'Download latest release',
    summary: 'Downloads the latest version of the desktop app with proper filename',
    response: {
      200: Type.String({ contentMediaType: 'application/x-apple-diskimage' }),
      404: Type.String(),
      500: ErrorResponseSchema,
    },
  },
}, async (request, reply) => {
  const versionData = getVersionData();

  if (!versionData) {
    reply.code(500).send({ error: 'Version data not found' });
    return;
  }

  const version = versionData.desktop.version;
  const filename = `Seance-${version}-mac.dmg`;
  const fileData = readReleaseFile(`darwin-arm64/${filename}`);

  if (!fileData) {
    reply.code(404).send('File not found');
    return;
  }

  reply
    .type('application/x-apple-diskimage')
    .header('Content-Disposition', `attachment; filename="${filename}"`)
    .send(fileData);
});

// Serve static files from web/ directory
await app.register(fastifyStatic, {
  root: join(process.cwd(), 'web'),
  prefix: '/',
  index: ['index.html'],
});

// SPA fallback - serve index.html for client-side routing
app.setNotFoundHandler(async (request, reply) => {
  // Don't apply SPA fallback to API routes
  if (request.url.startsWith('/updates')) {
    reply.code(404).send('Not found');
    return;
  }

  // Serve index.html for SPA routes
  try {
    const indexPath = join(process.cwd(), 'web', 'index.html');
    if (existsSync(indexPath)) {
      const content = readFileSync(indexPath, 'utf-8');
      reply.type('text/html').send(content);
      return;
    }
  } catch (error) {
    console.error('[Static File] Error serving index.html:', error);
  }

  reply.code(404).send('Not found');
});

// Start server
const port = Number(process.env.PORT || 3000);

try {
  await app.listen({ port, host: '0.0.0.0' });
  console.log(`🔮 Seance Update Server started on port ${port}`);
  console.log(`   Health: http://localhost:${port}/`);
  console.log(`   Updates: http://localhost:${port}/updates/`);
  console.log(`   OpenAPI Docs: http://localhost:${port}/ui`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
