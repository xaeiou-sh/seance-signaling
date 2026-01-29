/*
 * Public Environment Configuration
 *
 * These values are safe to commit to version control as they are
 * designed for client-side use and cannot be used to access sensitive data.
 *
 * Security is enforced through PostHog's domain allowlist feature.
 */

// Helper to get required environment variables - always panics if not set
function getRequiredEnv(key: string): string {
  const value = import.meta.env[key];

  if (!value) {
    throw new Error(
      `Missing required environment variable: ${key}\n` +
      `This must be set in devenv.nix before running.`
    );
  }

  return value;
}

export const ENV = {
  POSTHOG_KEY: 'phc_XdFjlV2BPaqX9xf0OoYcB6htSR6hkwPghHXjr00BVgg',
  POSTHOG_HOST: 'https://beholder.seance.dev',
  // Backend URL - REQUIRED, must be set in devenv.nix
  BACKEND_URL: getRequiredEnv('VITE_BACKEND_URL'),
} as const;