// JWT utilities for authentication
import jwt from 'jsonwebtoken';

// Use a strong secret in production - load from environment
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-in-production';
const JWT_EXPIRES_IN = '7d'; // Token valid for 7 days

export interface JWTPayload {
  userId: string;
  email: string;
}

/**
 * Sign a JWT token with user data
 */
export function signToken(payload: JWTPayload): string {
  if (JWT_SECRET === 'dev-secret-change-in-production' && process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET must be set in production');
  }

  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN,
  });
}

/**
 * Verify and decode a JWT token
 */
export function verifyToken(token: string): JWTPayload | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as JWTPayload;
    return decoded;
  } catch (error) {
    return null;
  }
}

/**
 * Extract token from Authorization header
 */
export function extractTokenFromHeader(authHeader: string | undefined): string | null {
  if (!authHeader) {
    return null;
  }

  // Expected format: "Bearer <token>"
  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return null;
  }

  return parts[1];
}
