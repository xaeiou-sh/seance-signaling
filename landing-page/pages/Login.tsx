// Login page
import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Navigation } from "@/components/navigation";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/lib/auth-context";

export default function Login() {
  const navigate = useNavigate();
  const { setAuth } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const loginMutation = trpc.auth.login.useMutation({
    onSuccess: (data) => {
      if (data.success) {
        setAuth(data.token, data.user);
        navigate("/dashboard");
      }
    },
    onError: (err) => {
      setError(err.message);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    loginMutation.mutate({ email, password });
  };

  return (
    <div className="min-h-screen bg-void">
      <Navigation />

      <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center px-4">
        <div className="w-full max-w-md">
          <div className="rounded-lg border border-phantom bg-void p-8">
            <h1 className="mb-6 text-center text-3xl font-bold text-pure">
              Sign In
            </h1>

            {error && (
              <div className="mb-4 rounded-md bg-flame/10 border border-flame p-3 text-sm text-flame">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="email" className="block text-sm font-medium text-mist mb-2">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full rounded-md border border-phantom bg-void px-4 py-2 text-pure placeholder-mist/50 focus:border-neon focus:outline-none focus:ring-1 focus:ring-neon"
                  placeholder="you@example.com"
                />
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-medium text-mist mb-2">
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                  className="w-full rounded-md border border-phantom bg-void px-4 py-2 text-pure placeholder-mist/50 focus:border-neon focus:outline-none focus:ring-1 focus:ring-neon"
                  placeholder="••••••••"
                />
              </div>

              <Button
                type="submit"
                disabled={loginMutation.isPending}
                className="w-full bg-neon text-void glow-neon transition-all duration-300 hover:glow-neon-intense font-mono"
              >
                {loginMutation.isPending ? "Signing in..." : "Sign In"}
              </Button>
            </form>

            <p className="mt-6 text-center text-sm text-mist">
              Don't have an account?{" "}
              <Link to="/signup" className="text-neon hover:underline">
                Sign up
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
