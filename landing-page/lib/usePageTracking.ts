import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { posthog } from './posthog';

export const usePageTracking = () => {
  const location = useLocation();

  useEffect(() => {
    if (typeof window !== 'undefined') {
      // Capture pageview with PostHog
      posthog.capture('$pageview', {
        $current_url: window.location.href,
      });
    }
  }, [location]);
};