import { useNavigate } from "react-router-dom";
import { Button } from "./ui/button";
import { Heart, Settings } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import { trpc } from "@/lib/trpc";
import { posthog } from "@/lib/posthog";

export const SubscriptionSection = () => {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();

  const subscriptionQuery = trpc.stripe.getSubscriptionStatus.useQuery(undefined, {
    enabled: isAuthenticated,
  });

  const createCheckoutMutation = trpc.stripe.createCheckoutSession.useMutation({
    onSuccess: (data) => {
      posthog.capture('subscription_checkout_started');
      window.location.href = data.url;
    },
    onError: (error) => {
      console.error('Failed to create checkout session:', error);
      posthog.capture('subscription_checkout_error', { error: error.message });
    },
  });

  const createPortalMutation = trpc.stripe.createPortalSession.useMutation({
    onSuccess: (data) => {
      posthog.capture('subscription_portal_opened');
      window.location.href = data.url;
    },
    onError: (error) => {
      console.error('Failed to create portal session:', error);
      posthog.capture('subscription_portal_error', { error: error.message });
    },
  });

  const handleSupportClick = () => {
    if (!isAuthenticated) {
      posthog.capture('subscription_sign_in_clicked');
      navigate('/login');
      return;
    }

    createCheckoutMutation.mutate({
      successUrl: window.location.href,
      cancelUrl: window.location.href,
    });
  };

  const handleManageSubscription = () => {
    createPortalMutation.mutate({
      returnUrl: window.location.href,
    });
  };

  const hasSubscription = subscriptionQuery.data?.hasSubscription;
  const isActive = subscriptionQuery.data?.status === 'active' || subscriptionQuery.data?.status === 'trialing';

  return (
    <div className="mt-16 pt-16 border-t border-phantom">
      <div className="text-center">
        {!isAuthenticated ? (
          <>
            <Heart className="mx-auto h-12 w-12 text-flame mb-4" />
            <h2 className="mb-4 text-2xl font-bold text-pure">
              Support Development
            </h2>
            <p className="mx-auto mb-6 max-w-xl text-mist">
              Sign in to support Seance development with a $5/month donation and get convenient access to prebuilt binaries.
            </p>
            <Button
              onClick={handleSupportClick}
              className="bg-flame text-void glow-flame transition-all duration-300 hover:glow-flame-intense font-mono"
            >
              <Heart className="h-4 w-4" />
              Sign In to Support
            </Button>
          </>
        ) : hasSubscription && isActive ? (
          <>
            <Heart className="mx-auto h-12 w-12 text-neon mb-4 animate-pulse" />
            <h2 className="mb-4 text-2xl font-bold text-pure">
              Thank You for Supporting Seance!
            </h2>
            <p className="mx-auto mb-6 max-w-xl text-mist">
              Your $5/month donation helps keep this project alive and thriving.
            </p>
            <Button
              onClick={handleManageSubscription}
              disabled={createPortalMutation.isPending}
              variant="outline"
              className="border-neon text-neon hover:bg-neon hover:text-void transition-all duration-300 font-mono"
            >
              <Settings className="h-4 w-4" />
              {createPortalMutation.isPending ? 'Loading...' : 'Manage Subscription'}
            </Button>
          </>
        ) : (
          <>
            <Heart className="mx-auto h-12 w-12 text-flame mb-4" />
            <h2 className="mb-4 text-2xl font-bold text-pure">
              Support Development
            </h2>
            <p className="mx-auto mb-6 max-w-xl text-mist">
              Support Seance with a $5/month donation and get convenient access to prebuilt binaries.
              <span className="block mt-2 text-sm text-mist/70">
                (Seance is free and open source - this is purely optional!)
              </span>
            </p>
            <Button
              onClick={handleSupportClick}
              disabled={createCheckoutMutation.isPending}
              className="bg-flame text-void glow-flame transition-all duration-300 hover:glow-flame-intense font-mono"
            >
              <Heart className="h-4 w-4" />
              {createCheckoutMutation.isPending ? 'Loading...' : 'Support for $5/month'}
            </Button>
          </>
        )}
      </div>
    </div>
  );
};
