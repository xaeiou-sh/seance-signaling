// Test page to demonstrate tRPC working
import { trpc } from "@/lib/trpc";

export default function TestTRPC() {
  // Test the health check endpoint
  const pingQuery = trpc.health.ping.useQuery();

  // Test the downloads endpoint
  const latestQuery = trpc.downloads.getLatest.useQuery();

  return (
    <div className="min-h-screen bg-void p-8">
      <div className="mx-auto max-w-4xl">
        <h1 className="mb-8 text-3xl font-bold text-pure">tRPC Test Page</h1>

        {/* Health Check */}
        <div className="mb-8 rounded-lg border border-phantom bg-void p-6">
          <h2 className="mb-4 text-xl font-bold text-neon">Health Check</h2>
          {pingQuery.isLoading && <p className="text-mist">Loading...</p>}
          {pingQuery.error && (
            <p className="text-flame">Error: {pingQuery.error.message}</p>
          )}
          {pingQuery.data && (
            <pre className="rounded bg-phantom p-4 text-sm text-mist">
              {JSON.stringify(pingQuery.data, null, 2)}
            </pre>
          )}
        </div>

        {/* Latest Download Info */}
        <div className="rounded-lg border border-phantom bg-void p-6">
          <h2 className="mb-4 text-xl font-bold text-neon">Latest Download</h2>
          {latestQuery.isLoading && <p className="text-mist">Loading...</p>}
          {latestQuery.error && (
            <p className="text-flame">Error: {latestQuery.error.message}</p>
          )}
          {latestQuery.data && (
            <pre className="rounded bg-phantom p-4 text-sm text-mist">
              {JSON.stringify(latestQuery.data, null, 2)}
            </pre>
          )}
        </div>

        <div className="mt-8">
          <p className="text-mist">
            ✅ If you see data above, tRPC is working correctly with full type safety!
          </p>
        </div>
      </div>
    </div>
  );
}
