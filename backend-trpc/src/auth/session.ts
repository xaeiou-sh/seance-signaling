// Zitadel OIDC token validation via JWT verification
import { createRemoteJWKSet, jwtVerify } from 'jose';
import type { JWTPayload } from 'jose';

// Keeping same interface name for backward compatibility
export interface AutheliaUser {
  id: string;
  email: string;
  groups: string[];
}

const ZITADEL_ISSUER = process.env.ZITADEL_ISSUER;

if (!ZITADEL_ISSUER) {
  throw new Error('ZITADEL_ISSUER environment variable is not set');
}

// JWKS endpoint for JWT verification
const JWKS = createRemoteJWKSet(new URL(`${ZITADEL_ISSUER}/oauth/v2/keys`));

interface ZitadelTokenPayload extends JWTPayload {
  sub: string;
  email?: string;
  'urn:zitadel:iam:org:project:roles'?: Record<string, Record<string, unknown>>;
}

/**
 * Validate Zitadel access token via JWT verification
 * Uses JWKS to verify signature without calling Zitadel (fast, local validation)
 */
export async function validateSession(accessToken: string | undefined): Promise<AutheliaUser | null> {
  if (!accessToken) {
    return null;
  }

  if (!ZITADEL_ISSUER) {
    throw new Error('ZITADEL_ISSUER environment variable is not set');
  }

  try {
    // Verify JWT signature and claims
    const { payload } = await jwtVerify(accessToken, JWKS, {
      issuer: ZITADEL_ISSUER,
      // audience can be added here if needed for additional security
    }) as { payload: ZitadelTokenPayload };

    const sub = payload.sub;
    const email = payload.email;

    if (!sub) {
      throw new Error('Token missing required "sub" claim');
    }

    if (!email) {
      throw new Error('Token missing required "email" claim');
    }

    // Extract roles from Zitadel custom claim
    // Zitadel provides roles as: { "role_name": { "org_id": "..." }, ... }
    const rolesObj = payload['urn:zitadel:iam:org:project:roles'];
    const groups = rolesObj ? Object.keys(rolesObj) : [];

    return {
      id: sub,
      email: email,
      groups: groups,
    };
  } catch (error) {
    if (error instanceof Error) {
      console.error('Token validation error:', error.message);
    } else {
      console.error('Token validation error:', error);
    }
    return null;
  }
}
