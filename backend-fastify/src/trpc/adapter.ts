// Fastify adapter for tRPC
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { fetchRequestHandler } from '@trpc/server/adapters/fetch';
import type { AnyRouter } from '@trpc/server';
import { createContext } from './context';

export function registerTRPC(
  fastify: FastifyInstance,
  {
    router,
    prefix = '/trpc',
  }: {
    router: AnyRouter;
    prefix?: string;
  }
) {
  fastify.all(`${prefix}/*`, async (req: FastifyRequest, reply: FastifyReply) => {
    // Create a Web Request object from Fastify request
    const url = new URL(
      req.url,
      `${req.protocol}://${req.hostname}`
    );

    const request = new Request(url, {
      method: req.method,
      headers: req.headers as HeadersInit,
      body:
        req.method === 'GET' || req.method === 'HEAD'
          ? undefined
          : JSON.stringify(req.body),
    });

    // Handle the request using tRPC's fetch adapter
    const response = await fetchRequestHandler({
      endpoint: prefix,
      req: request,
      router,
      createContext: () => createContext({ req, res: reply }),
    });

    // Copy response headers
    response.headers.forEach((value, key) => {
      reply.header(key, value);
    });

    // Set status and send body
    reply.status(response.status);

    if (response.body) {
      const body = await response.text();
      reply.send(body);
    } else {
      reply.send();
    }
  });
}
