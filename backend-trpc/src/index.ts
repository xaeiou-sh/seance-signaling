// Seance Backend Server
// Serves desktop app updates + web app

// ARCHIVED: SSL verification workaround for Zitadel auth
// Auth system temporarily disabled
// const isDevelopment = process.env.ZITADEL_ISSUER?.includes('.localhost') ?? false;
// if (isDevelopment) {
//   process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
//   console.log('[Dev] SSL verification disabled for .localhost domains');
// }

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
import Stripe from 'stripe';
import { storeSubscription, deleteSubscription } from './stripe/subscription-storage.js';

const app = express();

// Stripe webhook needs raw body for signature verification
// Must be registered BEFORE express.json() middleware
app.post('/stripe/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];

  if (!sig || !process.env.STRIPE_WEBHOOK_SECRET || !process.env.STRIPE_SECRET_KEY) {
    console.error('[Stripe Webhook] Missing signature or secrets');
    res.status(400).send('Webhook configuration error');
    return;
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
    apiVersion: '2024-12-18.acacia',
  });

  try {
    // Verify webhook signature
    const event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );

    console.log(`[Stripe Webhook] Received event: ${event.type}`);

    // Handle subscription events
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        console.log(`[Stripe Webhook] Checkout completed for ${session.customer_email}`);
        break;
      }

      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        const customer = await stripe.customers.retrieve(subscription.customer as string) as Stripe.Customer;

        if (customer.email) {
          await storeSubscription(customer.email, {
            customerId: subscription.customer as string,
            subscriptionId: subscription.id,
            status: subscription.status as any,
            currentPeriodEnd: subscription.current_period_end,
            cancelAtPeriodEnd: subscription.cancel_at_period_end,
          });

          console.log(`[Stripe Webhook] Subscription ${subscription.status} for ${customer.email}`);
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        const customer = await stripe.customers.retrieve(subscription.customer as string) as Stripe.Customer;

        if (customer.email) {
          await deleteSubscription(customer.email);
          console.log(`[Stripe Webhook] Subscription deleted for ${customer.email}`);
        }
        break;
      }

      default:
        console.log(`[Stripe Webhook] Unhandled event type: ${event.type}`);
    }

    res.json({ received: true });
  } catch (error) {
    console.error('[Stripe Webhook] Error:', error);
    res.status(400).send(`Webhook Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
});

// Middleware
app.use(cors({ credentials: true, origin: true }));
app.use(cookieParser());
app.use(express.json({ limit: '500mb' })); // For large deployments
app.use(express.urlencoded({ extended: true }));

// Builder key hashes - SHA256 hashes of authorized builder public keys
// These are hardcoded since they're public (hashes) and don't vary by environment
// See config.yml for key generation instructions
const BUILDER_KEY_HASHES = [
  'adf1e1bee2a545ca24690755a59ea58af30cf9f86692541a6a932a75dc831334',
];

// Validate hashes at startup
for (const hash of BUILDER_KEY_HASHES) {
  if (!/^[a-f0-9]{64}$/i.test(hash)) {
    throw new Error(`Invalid SHA-256 hash in BUILDER_KEY_HASHES: ${hash}`);
  }
}

if (BUILDER_KEY_HASHES.length === 0) {
  throw new Error('BUILDER_KEY_HASHES must contain at least one hash');
}

const config = { builderKeyHashes: BUILDER_KEY_HASHES };
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

// ARCHIVED: OIDC authentication endpoints
// Self-hosted auth moved to /archive directory
// These endpoints are disabled until auth is reimplemented
//
// app.get('/auth/callback', async (req, res) => {
//   res.status(501).send('Authentication temporarily disabled');
// });
//
// app.post('/auth/logout', (req, res) => {
//   res.status(501).send('Authentication temporarily disabled');
// });

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
