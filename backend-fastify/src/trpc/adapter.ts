// Express adapter for tRPC with OpenAPI support
import { createExpressMiddleware } from '@trpc/server/adapters/express';
import { createOpenApiExpressMiddleware } from 'trpc-to-openapi';
import type { Express } from 'express';
import type { AnyRouter } from '@trpc/server';
import { createContext } from './context.js';

export function registerTRPC(
  app: Express,
  {
    router,
    prefix = '/trpc',
  }: {
    router: AnyRouter;
    prefix?: string;
  }
) {
  // Register standard tRPC middleware for RPC calls
  app.use(
    prefix,
    createExpressMiddleware({
      router,
      createContext,
      onError({ path, error }) {
        console.error(`[tRPC] Error in '${path}':`, error);
      },
    })
  );

  // Register OpenAPI middleware for REST endpoints
  app.use(
    '/api',
    createOpenApiExpressMiddleware({
      router,
      createContext,
      onError({ path, error }) {
        console.error(`[OpenAPI] Error in '${path}':`, error);
      },
    })
  );
}
