// Signout page - handles logout flow
import { useEffect, useRef } from "react";
import { Navigation } from "@/components/navigation";
import { HeroBackground } from "@/components/HeroBackground";
import { CursorOverlay } from "@/components/CursorOverlay";

export default function Signout() {
  const hasStartedLogout = useRef(false);

  useEffect(() => {
    // Only run logout once
    if (hasStartedLogout.current) {
      return;
    }
    hasStartedLogout.current = true;

    async function performLogout() {
      // Clear backend cookies
      try {
        await fetch(`${import.meta.env.VITE_BACKEND_URL}/auth/logout`, {
          method: 'POST',
          credentials: 'include',
        });
      } catch (error) {
        console.error('Logout error:', error);
      }

      // Redirect to Zitadel to end session there too
      const authDomain = import.meta.env.VITE_AUTH_DOMAIN || 'auth.dev.localhost';
      const logoutUrl = new URL(`https://${authDomain}/oidc/v1/end_session`);
      logoutUrl.searchParams.set('post_logout_redirect_uri', window.location.origin);

      window.location.href = logoutUrl.toString();
    }

    performLogout();
  }, []);

  return (
    <div className="min-h-screen bg-void">
      <Navigation />

      <section className="relative overflow-hidden">
        <CursorOverlay />
        <HeroBackground />

        <div className="relative z-10 mx-auto max-w-3xl px-4 py-24 sm:px-6 sm:py-32 lg:py-40">
          <div className="text-center">
            <h1 className="mb-6 text-3xl font-bold tracking-tight text-pure sm:text-4xl lg:text-5xl">
              Signing out...
            </h1>
            <p className="mx-auto mb-12 max-w-2xl text-lg leading-relaxed text-mist sm:text-xl">
              Please wait while we sign you out.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
