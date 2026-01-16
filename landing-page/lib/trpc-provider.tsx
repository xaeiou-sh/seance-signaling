// tRPC Provider component
import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { httpBatchLink } from '@trpc/client';
import { trpc } from './trpc';
import { ENV } from '@/env.public';

function TRPCProviderInner({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 60 * 1000, // 1 minute
        retry: 1,
      },
    },
  }));

  const [trpcClient] = useState(() =>
    trpc.createClient({
      links: [
        httpBatchLink({
          url: `${ENV.BACKEND_URL}/trpc`,
          credentials: 'include',  // Include cookies for Authelia session
          headers() {
            // No longer need JWT token - Authelia uses session cookies
            return {};
          },
        }),
      ],
    })
  );

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        {children}
      </QueryClientProvider>
    </trpc.Provider>
  );
}

export function TRPCProvider({ children }: { children: React.ReactNode }) {
  // Wrap in AuthProvider's consumer to access token
  return <TRPCProviderInner>{children}</TRPCProviderInner>;
}
