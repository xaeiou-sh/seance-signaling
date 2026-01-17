import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Navigation } from "@/components/navigation";
import { HeroBackground } from "@/components/HeroBackground";
import { CursorOverlay } from "@/components/CursorOverlay";
import { Button } from "@/components/ui/button";
import { Download as DownloadIcon } from "lucide-react";
import { FaApple, FaLinux, FaWindows } from "react-icons/fa";
import { posthog } from "@/lib/posthog";
import { useAuth } from "@/lib/auth-context";
import { trpc } from "@/lib/trpc";

type OS = "mac" | "linux" | "windows" | "unknown";

const detectOS = (): OS => {
  const userAgent = window.navigator.userAgent.toLowerCase();
  const platform = window.navigator.platform.toLowerCase();

  if (platform.includes("mac") || userAgent.includes("mac")) {
    return "mac";
  }
  if (platform.includes("linux") || userAgent.includes("linux")) {
    return "linux";
  }
  if (platform.includes("win") || userAgent.includes("windows")) {
    return "windows";
  }
  return "unknown";
};

export default function Download() {
  const navigate = useNavigate();
  const { isAuthenticated, isLoading } = useAuth();
  const [os, setOs] = useState<OS>("unknown");
  const [downloading, setDownloading] = useState(false);

  const subscriptionQuery = trpc.stripe.getSubscriptionStatus.useQuery(undefined, {
    enabled: isAuthenticated,
  });

  const downloadQuery = trpc.downloads.getProtectedDownload.useQuery(undefined, {
    enabled: isAuthenticated && subscriptionQuery.data?.hasSubscription === true,
  });

  // Redirect to checkout if not authenticated or no active subscription
  useEffect(() => {
    // Wait for auth to finish loading
    if (isLoading) {
      return;
    }

    if (!isAuthenticated) {
      posthog.capture('download_auth_required');
      navigate('/login');
      return;
    }

    if (subscriptionQuery.data &&
        !subscriptionQuery.data.hasSubscription) {
      posthog.capture('download_subscription_required');
      navigate('/checkout');
      return;
    }

    if (subscriptionQuery.data?.hasSubscription &&
        subscriptionQuery.data.status !== 'active' &&
        subscriptionQuery.data.status !== 'trialing') {
      posthog.capture('download_subscription_inactive', { status: subscriptionQuery.data.status });
      navigate('/checkout');
      return;
    }
  }, [isAuthenticated, isLoading, subscriptionQuery.data, navigate]);

  useEffect(() => {
    const detectedOS = detectOS();
    setOs(detectedOS);

    // Auto-download for Mac users (only if subscribed and download URL is ready)
    if (detectedOS === "mac" &&
        subscriptionQuery.data?.hasSubscription &&
        (subscriptionQuery.data.status === 'active' || subscriptionQuery.data.status === 'trialing') &&
        downloadQuery.data?.downloadUrl) {
      posthog.capture('download_started', {
        method: 'auto',
        os: 'mac',
        version: downloadQuery.data.version,
      });
      setDownloading(true);
      window.location.href = downloadQuery.data.downloadUrl;
    }
  }, [subscriptionQuery.data, downloadQuery.data]);

  const handleManualDownload = () => {
    if (!downloadQuery.data?.downloadUrl) {
      console.error('Download URL not available');
      return;
    }

    posthog.capture('download_started', {
      method: 'manual',
      os: 'mac',
      version: downloadQuery.data.version,
    });
    setDownloading(true);
    window.location.href = downloadQuery.data.downloadUrl;
  };

  const handleWebAppClick = () => {
    posthog.capture('web_app_redirect_clicked', {
      os: os,
    });
  };

  return (
    <div className="min-h-screen bg-void">
      <Navigation />

      {/* Hero Section with animated background */}
      <section className="relative overflow-hidden">
        {/* Cursor Overlay */}
        <CursorOverlay />
        {/* Animated Background */}
        <HeroBackground />

        <div className="relative z-10 mx-auto max-w-3xl px-4 py-24 sm:px-6 sm:py-32 lg:py-40">
          <div className="text-center">
            {os === "mac" ? (
              <>
                <div className="mb-8 flex justify-center">
                  <FaApple className="h-24 w-24 text-flame animate-pulse" />
                </div>
                <h1 className="mb-6 text-3xl font-bold tracking-tight text-pure sm:text-4xl lg:text-5xl">
                  {downloading ? "Download Starting..." : "Download Seance"}
                </h1>
                <p className="mx-auto mb-8 max-w-2xl text-lg leading-relaxed text-mist sm:text-xl">
                  {downloading
                    ? "Your download should begin automatically. If it doesn't, click the button below."
                    : "Click the button below to download Seance for macOS."}
                </p>
                <Button
                  onClick={handleManualDownload}
                  size="xl"
                  className="group bg-flame text-void glow-flame transition-all duration-300 hover:glow-flame-intense font-mono"
                >
                  <DownloadIcon className="h-5 w-5" />
                  Download for macOS
                </Button>
              </>
            ) : (
              <>
                <div className="mb-8">
                  <h1 className="mb-6 text-3xl font-bold tracking-tight text-pure sm:text-4xl lg:text-5xl">
                    Your OS is not supported yet
                  </h1>
                  <p className="mx-auto mb-8 max-w-2xl text-lg leading-relaxed text-mist sm:text-xl">
                    Seance is currently only available for macOS.
                    However, you can still collaborate with other people who have the desktop app!
                  </p>
                  <a
                    href="https://app.seance.dev"
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={handleWebAppClick}
                  >
                    <Button
                      size="xl"
                      className="group bg-flame text-void glow-flame transition-all duration-300 hover:glow-flame-intense font-mono"
                    >
                      Go to Web App
                    </Button>
                  </a>
                </div>

                <div className="mt-16 pt-16 border-t border-phantom">
                  <h2 className="mb-8 text-xl font-bold text-pure">
                    Coming Soon To
                  </h2>
                  <div className="flex justify-center gap-12">
                    <div className="flex flex-col items-center gap-3 opacity-50">
                      <FaApple className="h-16 w-16 text-mist" />
                      <span className="text-sm text-mist font-mono">macOS</span>
                    </div>
                    <div className="flex flex-col items-center gap-3 opacity-50">
                      <FaLinux className="h-16 w-16 text-mist" />
                      <span className="text-sm text-mist font-mono">Linux</span>
                    </div>
                    <div className="flex flex-col items-center gap-3 opacity-50">
                      <FaWindows className="h-16 w-16 text-mist" />
                      <span className="text-sm text-mist font-mono">Windows</span>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}