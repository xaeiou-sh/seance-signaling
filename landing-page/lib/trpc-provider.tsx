// tRPC Provider component
import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { httpBatchLink } from '@trpc/client';
import { trpc } from './trpc';
import { useAuth } from './auth-context';

// Get API URL from environment or default to localhost
const getApiUrl = () => {
  if (import.meta.env.PROD) {
    return 'https://backend.seance.dev/trpc';
  }
  return 'http://localhost:8080/trpc';
};

function TRPCProviderInner({ children }: { children: React.ReactNode }) {
  const { token } = useAuth();

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
          url: getApiUrl(),
          headers() {
            // Include JWT token in Authorization header if available
            if (token) {
              return {
                Authorization: `Bearer ${token}`,
              };
            }
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
