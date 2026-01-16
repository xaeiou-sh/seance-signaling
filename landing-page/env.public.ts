/*
 * Public Environment Configuration
 *
 * These values are safe to commit to version control as they are
 * designed for client-side use and cannot be used to access sensitive data.
 *
 * Security is enforced through PostHog's domain allowlist feature.
 */

export const ENV = {
  POSTHOG_KEY: 'phc_XdFjlV2BPaqX9xf0OoYcB6htSR6hkwPghHXjr00BVgg',
  POSTHOG_HOST: 'https://backend.seance.dev/beholder',
} as const;