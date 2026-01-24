import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Navigation } from "@/components/navigation";
import { HeroBackground } from "@/components/HeroBackground";
import { CursorOverlay } from "@/components/CursorOverlay";
import { Button } from "@/components/ui/button";
import { Heart, Check } from "lucide-react";
// ARCHIVED: Auth disabled
// import { useAuth } from "@/lib/auth-context";
import { trpc } from "@/lib/trpc";
import { posthog } from "@/lib/posthog";

export default function Checkout() {
  const navigate = useNavigate();
  // ARCHIVED: Auth disabled
  const isAuthenticated = false;
  const isLoading = false;

  const subscriptionQuery = trpc.stripe.getSubscriptionStatus.useQuery(undefined, {
    enabled: isAuthenticated,
  });

  const createCheckoutMutation = trpc.stripe.createCheckoutSession.useMutation({
    onSuccess: (data) => {
      console.log('Checkout session created:', data);
      posthog.capture('checkout_started');
      window.location.href = data.url;
    },
    onError: (error) => {
      console.error('Failed to create checkout session:', error);
      alert(`Checkout error: ${error.message}`);
      posthog.capture('checkout_error', { error: error.message });
    },
  });

  // Redirect to download if already subscribed
  useEffect(() => {
    if (subscriptionQuery.data?.hasSubscription &&
        (subscriptionQuery.data.status === 'active' || subscriptionQuery.data.status === 'trialing')) {
      navigate('/download');
    }
  }, [subscriptionQuery.data, navigate]);

  const handleSubscribe = () => {
    console.log('Subscribe button clicked', { isAuthenticated });

    if (!isAuthenticated) {
      posthog.capture('checkout_sign_in_clicked');
      navigate('/login');
      return;
    }

    posthog.capture('checkout_subscribe_clicked');
    console.log('Creating checkout session...');
    createCheckoutMutation.mutate({
      successUrl: `${window.location.origin}/download`,
      cancelUrl: window.location.href,
    });
  };

  return (
    <div className="min-h-screen bg-void">
      <Navigation />

      <section className="relative overflow-hidden">
        <CursorOverlay />
        <HeroBackground />

        <div className="relative z-10 mx-auto max-w-3xl px-4 py-24 sm:px-6 sm:py-32 lg:py-40">
          <div className="text-center">
            <Heart className="mx-auto h-16 w-16 text-flame mb-6 animate-pulse" />

            <h1 className="mb-6 text-3xl font-bold tracking-tight text-pure sm:text-4xl lg:text-5xl">
              Support Seance Development
            </h1>

            <p className="mx-auto mb-12 max-w-2xl text-lg leading-relaxed text-mist sm:text-xl">
              Get convenient access to prebuilt binaries and support open-source development.
            </p>

            {/* Pricing Card */}
            <div className="mx-auto max-w-md mb-12 p-8 border border-phantom rounded-lg bg-void/40 backdrop-blur-sm">
              <div className="mb-6">
                <div className="text-5xl font-bold text-pure mb-2">$5</div>
                <div className="text-mist">per month</div>
              </div>

              <ul className="space-y-4 mb-8 text-left">
                <li className="flex items-start gap-3">
                  <Check className="h-5 w-5 text-neon flex-shrink-0 mt-0.5" />
                  <span className="text-mist">
                    Convenient prebuilt binaries for macOS
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <Check className="h-5 w-5 text-neon flex-shrink-0 mt-0.5" />
                  <span className="text-mist">
                    Automatic updates delivered to your desktop
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <Check className="h-5 w-5 text-neon flex-shrink-0 mt-0.5" />
                  <span className="text-mist">
                    Support continued development
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <Check className="h-5 w-5 text-neon flex-shrink-0 mt-0.5" />
                  <span className="text-mist">
                    Cancel anytime
                  </span>
                </li>
              </ul>

              <Button
                onClick={handleSubscribe}
                disabled={createCheckoutMutation.isPending || subscriptionQuery.isLoading}
                size="lg"
                className="w-full bg-flame text-void glow-flame transition-all duration-300 hover:glow-flame-intense font-mono"
              >
                {createCheckoutMutation.isPending ? (
                  'Loading...'
                ) : !isAuthenticated ? (
                  <>
                    <Heart className="h-4 w-4" />
                    Sign In to Subscribe
                  </>
                ) : (
                  <>
                    <Heart className="h-4 w-4" />
                    Subscribe for $5/month
                  </>
                )}
              </Button>
            </div>

            <p className="text-sm text-mist/70 max-w-xl mx-auto">
              Seance is free and open-source software (MIT license).
              This subscription provides convenient prebuilt binaries and supports development.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
