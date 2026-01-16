// Authelia session validation via /api/verify endpoint
export interface AutheliaUser {
  id: string;
  email: string;
  groups: string[];
}

const AUTHELIA_URL = process.env.AUTHELIA_URL || 'http://localhost:9091';

/**
 * Validate Authelia session by calling /api/verify endpoint
 * Authelia sessions are encrypted in Redis, so we need to use the verification endpoint
 */
export async function validateSession(sessionCookie: string | undefined): Promise<AutheliaUser | null> {
  if (!sessionCookie) {
    return null;
  }

  try {
    // Call Authelia's verification endpoint with the session cookie
    const response = await fetch(`${AUTHELIA_URL}/api/verify`, {
      method: 'GET',
      headers: {
        'Cookie': `seance_session=${sessionCookie}`,
        'X-Original-URL': 'https://backend.dev.localhost/api/auth/me',
      },
    });

    if (response.status !== 200) {
      return null;
    }

    // Authelia returns user info in headers
    const username = response.headers.get('Remote-User');
    const email = response.headers.get('Remote-Email');
    const groupsHeader = response.headers.get('Remote-Groups');
    const groups = groupsHeader ? groupsHeader.split(',').map(g => g.trim()) : [];

    if (username && email) {
      return {
        id: username,
        email: email,
        groups: groups,
      };
    }

    return null;
  } catch (error) {
    console.error('Session validation error:', error);
    return null;
  }
}
