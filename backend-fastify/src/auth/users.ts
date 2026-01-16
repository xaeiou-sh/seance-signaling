// In-memory user store - replace with real database later
// Using simple password hashing for now (will use bcrypt in production)
import { createHash } from 'crypto';

export interface User {
  id: string;
  email: string;
  passwordHash: string;
  createdAt: Date;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
}

// In-memory store (will be replaced with database)
const users = new Map<string, User>();

/**
 * Simple password hashing - use bcrypt in production
 */
function hashPassword(password: string): string {
  return createHash('sha256').update(password).digest('hex');
}

/**
 * Create a new user
 */
export function createUser(email: string, password: string): User {
  if (users.has(email)) {
    throw new Error('User already exists');
  }

  if (password.length < 8) {
    throw new Error('Password must be at least 8 characters');
  }

  const user: User = {
    id: crypto.randomUUID(),
    email,
    passwordHash: hashPassword(password),
    createdAt: new Date(),
  };

  users.set(email, user);
  return user;
}

/**
 * Find user by email and verify password
 */
export function authenticateUser(email: string, password: string): User | null {
  const user = users.get(email);
  if (!user) {
    return null;
  }

  const inputHash = hashPassword(password);
  if (inputHash !== user.passwordHash) {
    return null;
  }

  return user;
}

/**
 * Find user by ID
 */
export function findUserById(userId: string): User | null {
  for (const user of users.values()) {
    if (user.id === userId) {
      return user;
    }
  }
  return null;
}

/**
 * Find user by email
 */
export function findUserByEmail(email: string): User | null {
  return users.get(email) || null;
}

/**
 * Update user's Stripe customer ID
 */
export function updateUserStripeCustomer(userId: string, customerId: string): User | null {
  const user = findUserById(userId);
  if (!user) {
    return null;
  }

  user.stripeCustomerId = customerId;
  return user;
}

/**
 * Update user's Stripe subscription ID
 */
export function updateUserStripeSubscription(userId: string, subscriptionId: string): User | null {
  const user = findUserById(userId);
  if (!user) {
    return null;
  }

  user.stripeSubscriptionId = subscriptionId;
  return user;
}
