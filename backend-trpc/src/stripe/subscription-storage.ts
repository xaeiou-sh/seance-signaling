// Redis storage for Stripe subscription data
import Redis from 'ioredis';

const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
});

export interface SubscriptionData {
  customerId: string;
  subscriptionId: string;
  status: 'active' | 'canceled' | 'past_due' | 'incomplete' | 'trialing';
  currentPeriodEnd: number; // Unix timestamp
  cancelAtPeriodEnd: boolean;
}

/**
 * Store subscription data in Redis
 * Key format: user:${email}:subscription
 */
export async function storeSubscription(
  userEmail: string,
  data: SubscriptionData
): Promise<void> {
  if (!userEmail) {
    throw new Error('User email is required');
  }

  const key = `user:${userEmail}:subscription`;
  await redis.set(key, JSON.stringify(data));
}

/**
 * Get subscription data from Redis
 */
export async function getSubscription(
  userEmail: string
): Promise<SubscriptionData | null> {
  if (!userEmail) {
    return null;
  }

  const key = `user:${userEmail}:subscription`;
  const data = await redis.get(key);

  if (!data) {
    return null;
  }

  try {
    return JSON.parse(data);
  } catch (error) {
    console.error('Failed to parse subscription data:', error);
    return null;
  }
}

/**
 * Delete subscription data from Redis
 */
export async function deleteSubscription(userEmail: string): Promise<void> {
  if (!userEmail) {
    return;
  }

  const key = `user:${userEmail}:subscription`;
  await redis.del(key);
}

/**
 * Check if user has active subscription
 */
export async function hasActiveSubscription(
  userEmail: string
): Promise<boolean> {
  const subscription = await getSubscription(userEmail);

  if (!subscription) {
    return false;
  }

  // Check if subscription is active and not expired
  const isActive = subscription.status === 'active' || subscription.status === 'trialing';
  const notExpired = subscription.currentPeriodEnd > Date.now() / 1000;

  return isActive && notExpired;
}

/**
 * Close Redis connection (call on server shutdown)
 */
export function closeRedis() {
  redis.disconnect();
}
