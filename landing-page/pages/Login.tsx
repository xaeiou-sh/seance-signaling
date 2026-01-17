import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Navigation } from "@/components/navigation";
import { HeroBackground } from "@/components/HeroBackground";
import { CursorOverlay } from "@/components/CursorOverlay";
import { useAuth } from "@/lib/auth-context";

export default function Login() {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();

  useEffect(() => {
    // If already authenticated, redirect to dashboard
    if (isAuthenticated) {
      navigate('/dashboard', { replace: true });
      return;
    }

    // Otherwise, redirect to Authelia login (will redirect back to dashboard)
    const authDomain = import.meta.env.VITE_AUTH_DOMAIN || 'auth.dev.localhost';
    const returnUrl = `${window.location.origin}/dashboard`;
    window.location.href = `https://${authDomain}/?rd=${encodeURIComponent(returnUrl)}`;
  }, [isAuthenticated, navigate]);

  return (
    <div className="min-h-screen bg-void">
      <Navigation />

      <section className="relative overflow-hidden">
        <CursorOverlay />
        <HeroBackground />

        <div className="relative z-10 mx-auto max-w-3xl px-4 py-24 sm:px-6 sm:py-32 lg:py-40">
          <div className="text-center">
            <h1 className="mb-6 text-3xl font-bold tracking-tight text-pure sm:text-4xl lg:text-5xl">
              Redirecting to login...
            </h1>
            <p className="mx-auto mb-12 max-w-2xl text-lg leading-relaxed text-mist sm:text-xl">
              Please wait while we redirect you to the authentication page.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
