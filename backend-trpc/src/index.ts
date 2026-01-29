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
import { createHash } from 'crypto';
import swaggerUi from 'swagger-ui-express';
import { generateOpenApiDocument } from 'trpc-to-openapi';
import { registerTRPC } from './trpc/adapter.js';
import { appRouter } from './trpc/router.js';
import Stripe from 'stripe';
import { storeSubscription, deleteSubscription } from './stripe/subscription-storage.js';
import { SpacesClient } from './spaces.js';

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
    apiVersion: '2025-12-15.clover',
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
            currentPeriodEnd: (subscription as any).current_period_end,
            cancelAtPeriodEnd: (subscription as any).cancel_at_period_end,
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

// Initialize Spaces client
if (!process.env.SPACES_ACCESS_KEY_ID) {
  throw new Error('SPACES_ACCESS_KEY_ID environment variable is required');
}
if (!process.env.SPACES_SECRET_ACCESS_KEY) {
  throw new Error('SPACES_SECRET_ACCESS_KEY environment variable is required');
}
if (!process.env.SPACES_BUCKET) {
  throw new Error('SPACES_BUCKET environment variable is required');
}
if (!process.env.SPACES_REGION) {
  throw new Error('SPACES_REGION environment variable is required');
}
if (!process.env.SPACES_ENDPOINT) {
  throw new Error('SPACES_ENDPOINT environment variable is required');
}
if (!process.env.SPACES_CDN_ENDPOINT) {
  throw new Error('SPACES_CDN_ENDPOINT environment variable is required');
}

const spacesClient = new SpacesClient({
  accessKeyId: process.env.SPACES_ACCESS_KEY_ID,
  secretAccessKey: process.env.SPACES_SECRET_ACCESS_KEY,
  bucket: process.env.SPACES_BUCKET,
  region: process.env.SPACES_REGION,
  endpoint: process.env.SPACES_ENDPOINT,
  cdnEndpoint: process.env.SPACES_CDN_ENDPOINT,
  pathPrefix: process.env.SPACES_PATH_PREFIX || 'prod',
});

console.log(`[Spaces] Initialized - bucket: ${process.env.SPACES_BUCKET}, prefix: ${process.env.SPACES_PATH_PREFIX || 'prod'}`);

// Helper to read version.json from Spaces
async function getVersionData() {
  try {
    const buffer = await spacesClient.downloadFile('releases/version.json');
    return JSON.parse(buffer.toString('utf-8'));
  } catch (error) {
    console.error('[Update Server] Failed to read version.json from Spaces:', error);
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
    const { files } = req.body as { files: Array<{ path: string; content: string }> };

    console.log(`[Deploy] Deploying ${files.length} files to Spaces`);

    // Upload each file to Spaces
    const uploadedFiles: Array<{ path: string; url: string; size: number }> = [];

    for (const file of files) {
      if (!file.path || !file.content) {
        console.warn('[Deploy] Skipping invalid file entry:', file);
        continue;
      }

      // Security: prevent path traversal
      if (file.path.includes('..') || file.path.startsWith('/')) {
        console.error('[Deploy] Path traversal attempt:', file.path);
        res.status(400).json({ error: 'Invalid file path' });
        return;
      }

      // Decode base64 content
      const content = Buffer.from(file.content, 'base64');

      // Determine content type
      let contentType = 'application/octet-stream';
      if (file.path.endsWith('.json')) {
        contentType = 'application/json';
      } else if (file.path.endsWith('.yml') || file.path.endsWith('.yaml')) {
        contentType = 'text/yaml';
      } else if (file.path.endsWith('.dmg')) {
        contentType = 'application/x-apple-diskimage';
      } else if (file.path.endsWith('.html')) {
        contentType = 'text/html';
      } else if (file.path.endsWith('.js')) {
        contentType = 'application/javascript';
      } else if (file.path.endsWith('.css')) {
        contentType = 'text/css';
      }

      // Upload to Spaces
      await spacesClient.uploadFile(file.path, content, contentType);

      const cdnUrl = spacesClient.getPublicUrl(file.path);
      uploadedFiles.push({
        path: file.path,
        url: cdnUrl,
        size: content.length,
      });

      console.log(`[Deploy] Uploaded ${file.path} (${content.length} bytes) -> ${cdnUrl}`);
    }

    console.log('[Deploy] Deployment complete');
    res.json({
      success: true,
      filesDeployed: files.length,
      files: uploadedFiles,
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
app.get('/updates/api/version.json', async (req, res) => {
  const versionData = await getVersionData();

  if (!versionData) {
    res.status(500).json({ error: 'Version data not found' });
    return;
  }

  res.json(versionData);
});

// Serve latest-mac.yml (YAML format for electron-updater)
app.get('/updates/darwin-arm64/latest-mac.yml', async (req, res) => {
  try {
    const manifest = await spacesClient.downloadFile('releases/darwin-arm64/latest-mac.yml');
    res.type('text/yaml').send(manifest);
  } catch (error) {
    console.error('[Update Server] Failed to fetch latest-mac.yml:', error);
    res.status(404).send('Manifest not found');
  }
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

// Health check endpoint for Kubernetes
app.get('/', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'seance-backend',
    timestamp: new Date().toISOString(),
  });
});

// Catch-all 404
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
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
