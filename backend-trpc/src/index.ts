// Seance Backend Server
// Serves desktop app updates + web app
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { readFileSync, existsSync, writeFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { createHash } from 'crypto';
import swaggerUi from 'swagger-ui-express';
import { generateOpenApiDocument } from 'trpc-to-openapi';
import { registerTRPC } from './trpc/adapter.js';
import { appRouter } from './trpc/router.js';

const app = express();

// Middleware
app.use(cors({ credentials: true, origin: true })); // Allow credentials for Authelia cookies
app.use(cookieParser()); // Parse Authelia session cookies
app.use(express.json({ limit: '500mb' })); // For large deployments
app.use(express.urlencoded({ extended: true }));

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

// Deploy endpoint
app.post('/deploy', async (req, res) => {
  const builderKey = req.headers['x-builder-key'] as string | undefined;

  if (!builderKey) {
    res.status(401).json({ error: 'Missing builder key' });
    return;
  }

  // Hash the provided key and check against configured hashes
  const keyHash = createHash('sha256').update(builderKey).digest('hex');

  if (!config.builderKeyHashes.includes(keyHash)) {
    console.error('[Deploy] Invalid builder key (hash not found)');
    res.status(401).json({ error: 'Invalid builder key' });
    return;
  }

  console.log('[Deploy] Builder key verified successfully');

  try {
    const { files, clearWeb } = req.body as { files: Array<{ path: string; content: string }>; clearWeb?: boolean };

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
        res.status(400).json({ error: 'Invalid file path' });
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
    res.json({
      success: true,
      filesDeployed: files.length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('[Deploy] Deployment failed:', error);
    res.status(500).json({
      error: 'Deployment failed',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

// Version API
app.get('/updates/api/version.json', (req, res) => {
  const versionData = getVersionData();

  if (!versionData) {
    res.status(500).json({ error: 'Version data not found' });
    return;
  }

  res.json(versionData);
});

// Serve update manifest (JSON format for electron-updater)
app.get('/updates/darwin-arm64/RELEASES.json', (req, res) => {
  const versionData = getVersionData();

  if (!versionData) {
    res.status(500).json({ error: 'Version data not found' });
    return;
  }

  const manifest = {
    version: versionData.desktop.version,
    releaseDate: versionData.desktop.released,
    url: `https://backend.seance.dev/updates/releases/darwin-arm64/Seance-${versionData.desktop.version}-mac.dmg`
  };

  res.json(manifest);
});

// Serve latest-mac.yml (YAML format for electron-updater)
app.get('/updates/darwin-arm64/latest-mac.yml', (req, res) => {
  const manifest = readReleaseFile('darwin-arm64/latest-mac.yml');

  if (!manifest) {
    res.status(404).send('Manifest not found');
    return;
  }

  res.type('text/yaml').send(manifest);
});

// Serve .dmg files
app.get('/updates/releases/darwin-arm64/:filename', (req, res) => {
  const { filename } = req.params;

  // Security: prevent path traversal
  if (filename.includes('..') || filename.includes('/')) {
    res.status(400).send('Invalid filename');
    return;
  }

  const fileData = readReleaseFile(`darwin-arm64/${filename}`);

  if (!fileData) {
    res.status(404).send('File not found');
    return;
  }

  res
    .type('application/x-apple-diskimage')
    .header('Content-Disposition', `attachment; filename="${filename}"`)
    .send(fileData);
});

// Download latest version with proper filename
app.get('/updates/darwin-arm64/download-latest', (req, res) => {
  const versionData = getVersionData();

  if (!versionData) {
    res.status(500).json({ error: 'Version data not found' });
    return;
  }

  const version = versionData.desktop.version;
  const filename = `Seance-${version}-mac.dmg`;
  const fileData = readReleaseFile(`darwin-arm64/${filename}`);

  if (!fileData) {
    res.status(404).send('File not found');
    return;
  }

  res
    .type('application/x-apple-diskimage')
    .header('Content-Disposition', `attachment; filename="${filename}"`)
    .send(fileData);
});

// Register tRPC
registerTRPC(app, {
  router: appRouter,
  prefix: '/trpc',
});

console.log('[tRPC] Registered at /trpc');
console.log('[OpenAPI] Registered at /api');

// Generate OpenAPI document
const openApiDocument = generateOpenApiDocument(appRouter, {
  title: 'Seance Backend API',
  description: 'Backend API for Seance desktop updates and web app hosting',
  version: '1.0.0',
  baseUrl: 'http://localhost:3000',
});

// Serve Swagger UI
app.use('/ui', swaggerUi.serve, swaggerUi.setup(openApiDocument));

console.log('[Swagger] Registered at /ui');

// Serve static files from web/ directory
app.use(express.static(join(process.cwd(), 'web')));

// SPA fallback - serve index.html for client-side routing
app.get('*', (req, res) => {
  // Don't apply SPA fallback to API routes
  if (req.url.startsWith('/updates') || req.url.startsWith('/trpc') || req.url.startsWith('/api')) {
    res.status(404).send('Not found');
    return;
  }

  // Serve index.html for SPA routes
  try {
    const indexPath = join(process.cwd(), 'web', 'index.html');
    if (existsSync(indexPath)) {
      res.sendFile(indexPath);
      return;
    }
  } catch (error) {
    console.error('[Static File] Error serving index.html:', error);
  }

  res.status(404).send('Not found');
});

// Start server
const port = Number(process.env.PORT || 3000);

app.listen(port, '0.0.0.0', () => {
  console.log(`🔮 Seance Update Server started on port ${port}`);
  console.log(`   Health: http://localhost:${port}/`);
  console.log(`   Updates: http://localhost:${port}/updates/`);
  console.log(`   Swagger UI: http://localhost:${port}/ui`);
  console.log(`   tRPC: http://localhost:${port}/trpc`);
  console.log(`   REST API: http://localhost:${port}/api`);
});
