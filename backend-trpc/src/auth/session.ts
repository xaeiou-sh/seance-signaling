// Authelia session validation via Redis
import Redis from 'ioredis';

const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
});

export interface AutheliaUser {
  id: string;
  email: string;
  groups: string[];
}

/**
 * Validate Authelia session from Redis and return user info
 * Authelia stores sessions in Redis with the session ID as the key
 */
export async function validateSession(sessionId: string | undefined): Promise<AutheliaUser | null> {
  if (!sessionId) {
    return null;
  }

  try {
    // Authelia stores sessions with this key format
    const sessionKey = `seance_session:${sessionId}`;
    const sessionData = await redis.get(sessionKey);

    if (!sessionData) {
      return null;
    }

    // Parse Authelia session data
    const session = JSON.parse(sessionData);

    // Authelia session structure contains user info
    if (session.username && session.emails && session.emails.length > 0) {
      return {
        id: session.username,
        email: session.emails[0],
        groups: session.groups || [],
      };
    }

    return null;
  } catch (error) {
    console.error('Session validation error:', error);
    return null;
  }
}

/**
 * Close Redis connection (call on server shutdown)
 */
export function closeRedis() {
  redis.disconnect();
}
