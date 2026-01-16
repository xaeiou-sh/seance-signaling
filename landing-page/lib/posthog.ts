import posthog from 'posthog-js';
import { ENV } from '@/env.public';

export const initPostHog = () => {
  // Only initialize PostHog in browser environment
  if (typeof window !== 'undefined') {
    if (ENV.POSTHOG_KEY) {
      posthog.init(ENV.POSTHOG_KEY, {
        api_host: ENV.POSTHOG_HOST,
        ui_host: 'https://us.posthog.com', // Points to actual PostHog UI for toolbar/features
        person_profiles: 'identified_only',
        capture_pageview: false, // We'll handle pageviews manually with React Router
        capture_pageleave: true,
        defaults: '2025-05-24',
        capture_exceptions: true, // Enable capturing exceptions via Error Tracking
        debug: import.meta.env.MODE === 'development',
      });
    } else {
      console.warn('PostHog API key not configured. Analytics will not be tracked.');
    }
  }
};

export { posthog };