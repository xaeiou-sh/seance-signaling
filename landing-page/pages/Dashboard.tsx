// Dashboard page - protected route
import { Navigate, Link } from "react-router-dom";
import { Navigation } from "@/components/navigation";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
// ARCHIVED: Auth disabled
// import { useAuth } from "@/lib/auth-context";

export default function Dashboard() {
  // ARCHIVED: Auth disabled
  const user = null as any;
  const isAuthenticated = false;
  const authLoading = false;

  // Query current user to verify token is still valid
  const { data: currentUser, isLoading, error } = trpc.auth.me.useQuery(undefined, {
    enabled: isAuthenticated,
  });

  // Show loading while checking authentication
  if (authLoading) {
    return (
      <div className="min-h-screen bg-void">
        <Navigation />
        <div className="flex items-center justify-center min-h-[calc(100vh-4rem)]">
          <p className="text-mist">Loading...</p>
        </div>
      </div>
    );
  }

  // Redirect to login if not authenticated (no Effect needed!)
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-void">
        <Navigation />
        <div className="flex items-center justify-center min-h-[calc(100vh-4rem)]">
          <p className="text-mist">Loading...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-void">
        <Navigation />
        <div className="flex items-center justify-center min-h-[calc(100vh-4rem)]">
          <div className="text-center">
            <p className="text-flame mb-4">Session expired or invalid</p>
            <Button onClick={() => navigate("/login")}>Sign in again</Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-void">
      <Navigation />

      <div className="mx-auto max-w-4xl px-4 py-12">
        <div className="mb-8 flex items-center justify-between">
          <h1 className="text-3xl font-bold text-pure">Dashboard</h1>
          <Link to="/signout">
            <Button
              variant="outline"
              className="border-phantom text-mist hover:border-flame hover:text-flame"
            >
              Sign Out
            </Button>
          </Link>
        </div>

        <div className="rounded-lg border border-phantom bg-void p-6 mb-6">
          <h2 className="mb-4 text-xl font-bold text-neon">Account Information</h2>
          <div className="space-y-2">
            <p className="text-mist">
              <span className="font-medium">Email:</span> {currentUser?.email || user?.email}
            </p>
            <p className="text-mist">
              <span className="font-medium">User ID:</span> {currentUser?.id || user?.id}
            </p>
          </div>
        </div>

        <div className="rounded-lg border border-phantom bg-void p-6">
          <h2 className="mb-4 text-xl font-bold text-neon">Subscription Status</h2>
          <p className="text-mist mb-4">
            No active subscription. Subscribe to get access to built binaries!
          </p>
          <Button className="bg-flame text-void glow-flame hover:glow-flame-intense">
            Subscribe for $5/month
          </Button>
        </div>
      </div>
    </div>
  );
}
