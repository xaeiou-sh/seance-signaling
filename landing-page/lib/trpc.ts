// tRPC client setup
import { createTRPCReact } from '@trpc/react-query';
import type { AppRouter } from '../../../backend-trpc/src/trpc/router';

export const trpc = createTRPCReact<AppRouter>();
