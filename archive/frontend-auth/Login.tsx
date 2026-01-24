import { useEffect, useRef } from "react";
import { Navigate } from "react-router-dom";
import { Navigation } from "@/components/navigation";
import { HeroBackground } from "@/components/HeroBackground";
import { CursorOverlay } from "@/components/CursorOverlay";
import { useAuth } from "@/lib/auth-context";

export default function Login() {
  const { isAuthenticated, isLoading } = useAuth();
  const hasRedirected = useRef(false);

  // External redirect to Zitadel (exception: can't use <Navigate> for external URLs)
  // Only redirect once when component determines user needs to authenticate
  useEffect(() => {
    if (isLoading || isAuthenticated || hasRedirected.current) {
      return;
    }

    hasRedirected.current = true;

    const authDomain = import.meta.env.VITE_AUTH_DOMAIN || 'auth.dev.localhost';
    const clientId = import.meta.env.VITE_ZITADEL_CLIENT_ID;

    if (!clientId) {
      console.error('VITE_ZITADEL_CLIENT_ID is not set');
      return;
    }

    const authUrl = new URL(`https://${authDomain}/oauth/v2/authorize`);
    authUrl.searchParams.set('client_id', clientId);
    authUrl.searchParams.set('redirect_uri', `${import.meta.env.VITE_BACKEND_URL}/auth/callback`);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', 'openid email profile');
    authUrl.searchParams.set('prompt', 'login');

    window.location.href = authUrl.toString();
  }, [isLoading, isAuthenticated]);

  // Already authenticated - redirect to dashboard (during render, no Effect!)
  if (!isLoading && isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

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
