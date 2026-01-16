// Signup page
import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Navigation } from "@/components/navigation";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/lib/auth-context";

export default function Signup() {
  const navigate = useNavigate();
  const { setAuth } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");

  const registerMutation = trpc.auth.register.useMutation({
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

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }

    registerMutation.mutate({ email, password });
  };

  return (
    <div className="min-h-screen bg-void">
      <Navigation />

      <div className="flex min-h-[calc(100vh-4rem)] items-center justify-center px-4">
        <div className="w-full max-w-md">
          <div className="rounded-lg border border-phantom bg-void p-8">
            <h1 className="mb-6 text-center text-3xl font-bold text-pure">
              Create Account
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
                <p className="mt-1 text-xs text-mist">
                  Must be at least 8 characters
                </p>
              </div>

              <div>
                <label htmlFor="confirmPassword" className="block text-sm font-medium text-mist mb-2">
                  Confirm Password
                </label>
                <input
                  id="confirmPassword"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  minLength={8}
                  className="w-full rounded-md border border-phantom bg-void px-4 py-2 text-pure placeholder-mist/50 focus:border-neon focus:outline-none focus:ring-1 focus:ring-neon"
                  placeholder="••••••••"
                />
              </div>

              <Button
                type="submit"
                disabled={registerMutation.isPending}
                className="w-full bg-neon text-void glow-neon transition-all duration-300 hover:glow-neon-intense font-mono"
              >
                {registerMutation.isPending ? "Creating account..." : "Create Account"}
              </Button>
            </form>

            <p className="mt-6 text-center text-sm text-mist">
              Already have an account?{" "}
              <Link to="/login" className="text-neon hover:underline">
                Sign in
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
