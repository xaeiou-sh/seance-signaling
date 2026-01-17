# Seance Authentication State - Before Kanidm Migration

**Date:** 2026-01-16
**Current Auth System:** Authelia
**Reason for Migration:** Authelia only supports static YAML user definitions, cannot handle `/signup` flow with dynamic user registration

---

## Current Architecture Overview

### Authentication Flow
1. User visits protected route (e.g., `/download`)
2. Frontend redirects to `/login` → redirects to `https://auth.dev.localhost`
3. Authelia displays login page
4. After login, Authelia redirects to `/dashboard` with session cookie
5. Frontend makes API calls with `credentials: 'include'` to send cookies
6. Backend validates session by calling Authelia's `/api/verify` endpoint
7. Authelia returns user info in response headers

### Domain Structure

**Local Development:**
- Marketing: `dev.localhost`
- Backend: `backend.dev.localhost`
- App: `app.dev.localhost`
- Auth: `auth.dev.localhost`
- Cookie domain: `dev.localhost` (shared across all subdomains)

**Production:**
- Marketing: `seance.dev`
- Backend: `backend.seance.dev`
- App: `app.seance.dev`
- Auth: `auth.seance.dev`
- Cookie domain: `seance.dev` (shared across all subdomains)

---

## File Locations & Configurations

### Authelia Configuration

**File:** `/Users/nicole/Documents/seance-signaling/authelia-config.yml`

Key features:
- Go template syntax for dev/prod environments: `{{ env "AUTH_DOMAIN" }}`
- Session storage: Redis (localhost:6379)
- Cookie name: `seance_session`
- Cookie domain: Strips "auth." from AUTH_DOMAIN (e.g., `dev.localhost` or `seance.dev`)
- User database: `./authelia-users.yml` (file-based, static)
- Storage: SQLite in `/tmp/authelia/` (ephemeral)
- Access control: Bypass by default, Express handles authorization

**Templated Values:**
```yaml
cookies:
  - domain: '{{ env "AUTH_DOMAIN" | trimPrefix "auth." }}'
    authelia_url: 'https://{{ env "AUTH_DOMAIN" }}'
    default_redirection_url: 'https://{{ env "CADDY_DOMAIN" }}'
```

**Users File:** `/Users/nicole/Documents/seance-signaling/authelia-users.yml`
```yaml
users:
  admin:
    displayname: "Admin User"
    password: "$argon2id$v=19$m=65536,t=3,p=4$..."
    email: admin@example.org
    groups:
      - users
```

**Process Start:** `devenv.nix` processes.authelia
```nix
export X_AUTHELIA_CONFIG_FILTERS=template
${lib.getExe pkgs.authelia} --config ./authelia-config.yml
```

### Backend Session Validation

**File:** `/Users/nicole/Documents/seance-signaling/backend-trpc/src/auth/session.ts`

**Method:** Calls Authelia's `/api/verify` endpoint
```typescript
const response = await fetch(`${AUTHELIA_URL}/api/verify`, {
  method: 'GET',
  headers: {
    'Cookie': `seance_session=${sessionCookie}`,
    'X-Original-URL': 'https://backend.dev.localhost/api/auth/me',
  },
});

// Authelia returns user info in headers
const username = response.headers.get('Remote-User');
const email = response.headers.get('Remote-Email');
const groupsHeader = response.headers.get('Remote-Groups');
```

**User Interface:**
```typescript
export interface AutheliaUser {
  id: string;      // username
  email: string;
  groups: string[];
}
```

### Backend tRPC Context

**File:** `/Users/nicole/Documents/seance-signaling/backend-trpc/src/trpc/context.ts`

Creates context with user info for all tRPC procedures:
```typescript
export async function createContext({ req, res }: CreateExpressContextOptions) {
  const sessionId = req.cookies['seance_session'];
  const user = await validateSession(sessionId);

  return { req, res, user };
}
```

### Backend Authorization Middleware

**File:** `/Users/nicole/Documents/seance-signaling/backend-trpc/src/trpc/trpc.ts`

**Protected Procedure:** Requires authentication
```typescript
const isAuthed = t.middleware(({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: 'UNAUTHORIZED' });
  }
  return next({ ctx: { ...ctx, user: ctx.user } });
});

export const protectedProcedure = t.procedure.use(isAuthed);
```

**Admin Procedure:** Requires 'admins' group
```typescript
const isAdmin = t.middleware(({ ctx, next }) => {
  if (!ctx.user?.groups.includes('admins')) {
    throw new TRPCError({ code: 'FORBIDDEN' });
  }
  return next({ ctx: { ...ctx, user: ctx.user } });
});

export const adminProcedure = t.procedure.use(isAdmin);
```

---

## Frontend Integration

### Auth Context

**File:** `/Users/nicole/Documents/seance-signaling/landing-page/lib/auth-context.tsx`

**Key Functions:**
```typescript
// Check auth status on mount
useEffect(() => {
  const response = await fetch(`${BACKEND_URL}/api/auth/me`, {
    credentials: 'include', // Send cookies
  });
  if (response.ok) {
    setUser(await response.json());
  }
}, []);

// Login: redirect to Authelia
const login = () => {
  window.location.href = `https://${authDomain}/?rd=${returnUrl}`;
};

// Logout: redirect to Authelia logout
const logout = () => {
  window.location.href = `https://${authDomain}/logout?rd=${returnUrl}`;
};
```

### Frontend Routes

**File:** `/Users/nicole/Documents/seance-signaling/landing-page/src/App.tsx`

Routes:
- `/` - Home (public)
- `/login` - Redirects to Authelia, then `/dashboard`
- `/signup` - Redirects to Authelia (same as login), then `/dashboard`
- `/checkout` - Requires auth, Stripe subscription flow
- `/download` - Requires auth + active subscription
- `/dashboard` - Requires auth

### Protected Route Pattern

**Example:** `/Users/nicole/Documents/seance-signaling/landing-page/pages/Download.tsx`

```typescript
useEffect(() => {
  if (isLoading) return;

  if (!isAuthenticated) {
    navigate('/login');
    return;
  }

  if (!subscriptionQuery.data?.hasSubscription) {
    navigate('/checkout');
    return;
  }
}, [isAuthenticated, isLoading, subscriptionQuery.data]);
```

---

## Stripe Integration (Critical for Migration)

### User Identification
**Key Point:** Stripe customers are linked to users via **email address**

**File:** `/Users/nicole/Documents/seance-signaling/backend-trpc/src/stripe/subscription-storage.ts`

```typescript
// Store subscription by email
export async function storeSubscription(
  userEmail: string,
  data: SubscriptionData
): Promise<void> {
  const key = `user:${userEmail}:subscription`;
  await redis.set(key, JSON.stringify(data));
}

// Check subscription by email
export async function hasActiveSubscription(
  userEmail: string
): Promise<boolean> {
  const subscription = await getSubscription(userEmail);
  // ...
}
```

**Redis Key Format:** `user:${email}:subscription`

**Subscription Data Structure:**
```typescript
interface SubscriptionData {
  customerId: string;       // Stripe customer ID
  subscriptionId: string;   // Stripe subscription ID
  status: 'active' | 'canceled' | 'past_due' | 'incomplete' | 'trialing';
  currentPeriodEnd: number; // Unix timestamp
  cancelAtPeriodEnd: boolean;
}
```

### Stripe Webhook Handler

**File:** `/Users/nicole/Documents/seance-signaling/backend-trpc/src/index.ts` (lines 20-90)

**Endpoint:** `POST /stripe/webhook`

**Events Handled:**
1. `checkout.session.completed` - Log checkout completion
2. `customer.subscription.created` - Store subscription in Redis
3. `customer.subscription.updated` - Update subscription in Redis
4. `customer.subscription.deleted` - Remove subscription from Redis

**Critical Logic:**
```typescript
const subscription = event.data.object as Stripe.Subscription;
const customer = await stripe.customers.retrieve(subscription.customer);

if (customer.email) {
  await storeSubscription(customer.email, {
    customerId: subscription.customer,
    subscriptionId: subscription.id,
    status: subscription.status,
    currentPeriodEnd: subscription.current_period_end,
    cancelAtPeriodEnd: subscription.cancel_at_period_end,
  });
}
```

### Stripe tRPC Endpoints

**File:** `/Users/nicole/Documents/seance-signaling/backend-trpc/src/trpc/routers/stripe.ts`

**Endpoints:**
1. `getSubscriptionStatus` - Check user's subscription (uses `ctx.user.email`)
2. `createCheckoutSession` - Create Stripe checkout (uses `ctx.user.email` for customer)
3. `createPortalSession` - Create customer portal link (finds customer by `ctx.user.email`)

**Example:**
```typescript
createCheckoutSession: protectedProcedure
  .mutation(async ({ ctx, input }) => {
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer_email: ctx.user.email, // <-- EMAIL CRITICAL HERE
      line_items: [{ price: PRICE_ID, quantity: 1 }],
      metadata: {
        userId: ctx.user.id,
        userEmail: ctx.user.email,
      },
    });
  })
```

---

## Caddy Configuration

**File:** `/Users/nicole/Documents/seance-signaling/Caddyfile`

```caddyfile
# Authelia authentication server
{$AUTH_DOMAIN} {
  reverse_proxy localhost:9091
}

# Backend with forward_auth for /dashboard
{$CADDY_DOMAIN} {
  @dashboard {
    path /dashboard*
  }

  handle @dashboard {
    forward_auth {$AUTH_DOMAIN} {
      uri /api/verify?rd=https://{$CADDY_DOMAIN}/
      copy_headers Remote-User Remote-Groups Remote-Name Remote-Email
    }
  }

  handle {
    reverse_proxy localhost:{$PORT}
  }
}
```

**Note:** Forward auth is only used for browser `/dashboard` route. All API authentication happens in Express via session validation.

---

## Environment Variables

**File:** `/Users/nicole/Documents/seance-signaling/devenv.nix`

**Development:**
```nix
env.AUTH_DOMAIN = "auth.dev.localhost";
env.CADDY_DOMAIN = "backend.dev.localhost";
env.VITE_AUTH_DOMAIN = "auth.dev.localhost";
env.VITE_BACKEND_URL = "https://backend.dev.localhost";
```

**Production:**
```nix
profiles.prod.module = {
  env.AUTH_DOMAIN = "auth.seance.dev";
  env.CADDY_DOMAIN = "backend.seance.dev";
  env.VITE_AUTH_DOMAIN = "auth.seance.dev";
  env.VITE_BACKEND_URL = "https://backend.seance.dev";
};
```

**Stripe (in .env):**
```bash
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_ID=price_...
```

---

## Redis Usage

**Services:**
- **Authelia:** Stores encrypted session data
  - Key format: `authelia-session:${sessionId}`
  - Data: Encrypted session blob (cannot be read directly)

- **Stripe:** Stores subscription data
  - Key format: `user:${email}:subscription`
  - Data: JSON with subscription details

**Configuration:**
- Host: localhost
- Port: 6379
- Persistence: Enabled (RDB snapshots)

---

## Critical Migration Points for Kanidm

### 1. Session Validation Must Change
Currently: Call Authelia `/api/verify` endpoint
Kanidm: Will need to implement OAuth2/OIDC or similar validation

**Files to Update:**
- `backend-trpc/src/auth/session.ts` - Replace validateSession function
- Must still return `{ id, email, groups }` structure

### 2. Email Address is Critical
**All Stripe integration depends on user email being stable and accessible**

Kanidm must provide:
- Stable email address in user profile
- Email accessible during session validation
- Email should not change (or handle Stripe customer updates if it does)

### 3. Frontend Login/Logout URLs
Currently: `https://auth.dev.localhost/?rd=...` and `/logout?rd=...`

**Files to Update:**
- `landing-page/lib/auth-context.tsx` - login() and logout() functions
- `landing-page/pages/Login.tsx` - Redirect URL
- `landing-page/pages/Signup.tsx` - Redirect URL

### 4. Cookie Domain Must Work
Kanidm must set cookies for `dev.localhost` / `seance.dev` domain

**Current Setup:**
- Cookie name: `seance_session`
- Domain: `dev.localhost` (works for all *.dev.localhost subdomains)
- SameSite: lax
- HttpOnly: true (assumed)
- Secure: true (HTTPS required)

### 5. Caddy Forward Auth
May need to update or remove `forward_auth` block if Kanidm doesn't support `/api/verify` endpoint

### 6. User Registration Flow
**This is the reason for migration!**

Kanidm must support:
- Dynamic user registration via web UI
- Users can create accounts without admin intervention
- Integration with existing email-based Stripe system

### 7. Group/Role Support
Current setup uses groups for RBAC:
- `adminProcedure` checks for `admins` group
- Kanidm must expose group membership during validation

---

## Testing Checklist After Migration

1. [ ] User can sign up dynamically
2. [ ] User can log in and access `/dashboard`
3. [ ] Session cookie works across all subdomains
4. [ ] `/api/auth/me` returns correct user data
5. [ ] Protected routes redirect to login
6. [ ] Logout clears session and redirects properly
7. [ ] Stripe checkout creates customer with correct email
8. [ ] Stripe webhook updates subscription in Redis
9. [ ] `/download` checks subscription status correctly
10. [ ] Customer portal works (finds customer by email)
11. [ ] Admin users have `admins` group
12. [ ] Regular users don't have admin access
13. [ ] Auto-updates still work (`/updates/*` endpoints public)

---

## Backup Current State

Before migration, backup:
1. `authelia-config.yml`
2. `authelia-users.yml`
3. `backend-trpc/src/auth/session.ts`
4. `landing-page/lib/auth-context.tsx`
5. Redis data: `redis-cli SAVE` to create dump.rdb

---

## Questions for Kanidm Integration

1. Does Kanidm support OAuth2/OIDC for API validation?
2. What's the equivalent of Authelia's `/api/verify` endpoint?
3. How does Kanidm handle session cookies across subdomains?
4. Can users self-register via web UI?
5. How are groups/roles exposed in the token/session?
6. What's the cookie name and format?
7. Does Kanidm require any special Caddy configuration?
8. Can Kanidm use the same Redis instance or does it need its own storage?

---

## Notes

- Current system is fully functional with Authelia
- Main limitation: Cannot add users dynamically (only via YAML file)
- Stripe integration is tightly coupled to user email addresses
- All auth logic is centralized in `backend-trpc/src/auth/session.ts` (good for migration)
- Frontend uses simple redirect-based auth flow (easy to adapt)
- Production parity is maintained via templated configs

---

**Migration Priority:** High - User registration is a core requirement for public launch
