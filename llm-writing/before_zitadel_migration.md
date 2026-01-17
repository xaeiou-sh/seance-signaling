# Seance Authentication State - Before Zitadel Migration

**Date:** 2026-01-16
**Current Auth System:** Authelia
**Target Auth System:** Zitadel
**Reason for Migration:** Authelia only supports static YAML user definitions, cannot handle `/signup` flow with dynamic user registration

---

## Why Zitadel?

**Perfect Fit Because:**
1. **OAuth2/OIDC native** - Industry standard, well-documented
2. **Self-service registration** - Built-in user signup UI
3. **Email stability** - Email is primary identifier (critical for Stripe)
4. **Session validation** - Standard OIDC token introspection
5. **RBAC built-in** - Roles, organizations, custom claims
6. **Single binary** - Can run standalone like Authelia
7. **API-first** - Easy to integrate with Express backend
8. **Active development** - Strong community, frequent updates

---

## Current Architecture Overview

### Authentication Flow (Authelia)
1. User visits protected route (e.g., `/download`)
2. Frontend redirects to `/login` → redirects to `https://auth.dev.localhost`
3. Authelia displays login page
4. After login, Authelia redirects to `/dashboard` with session cookie
5. Frontend makes API calls with `credentials: 'include'` to send cookies
6. Backend validates session by calling Authelia's `/api/verify` endpoint
7. Authelia returns user info in response headers

### Future Flow (Zitadel)
1. User visits protected route (e.g., `/download`)
2. Frontend redirects to `/login` → initiates OIDC authorization code flow
3. Zitadel displays login/signup page
4. After auth, Zitadel redirects to `/dashboard` with authorization code
5. Backend exchanges code for access token + refresh token
6. Frontend stores tokens (httpOnly cookies or localStorage)
7. Backend validates tokens via OIDC introspection or JWT verification
8. Zitadel returns user info with email, roles, groups

### Domain Structure

**Local Development:**
- Marketing: `dev.localhost`
- Backend: `backend.dev.localhost`
- App: `app.dev.localhost`
- Auth: `auth.dev.localhost` (Zitadel instance)
- Cookie domain: `dev.localhost` (shared across all subdomains)

**Production:**
- Marketing: `seance.dev`
- Backend: `backend.seance.dev`
- App: `app.seance.dev`
- Auth: `auth.seance.dev` (Zitadel instance)
- Cookie domain: `seance.dev` (shared across all subdomains)

---

## File Locations & Configurations

### Authelia Configuration (Current)

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

### Backend Session Validation (Current)

**File:** `/Users/nicole/Documents/seance-signaling/backend-trpc/src/auth/session.ts`

**Current Method:** Calls Authelia's `/api/verify` endpoint
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

**User Interface (Keep This!):**
```typescript
export interface AutheliaUser {
  id: string;      // username or sub claim
  email: string;   // CRITICAL for Stripe
  groups: string[]; // roles from Zitadel
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

**For Zitadel:** Change to extract access token from Authorization header or cookie

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

**For Zitadel:** Keep same logic, but `groups` will come from Zitadel roles/claims

---

## Frontend Integration

### Auth Context (Current)

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

**For Zitadel:** Use OIDC authorization code flow
```typescript
// Login: initiate OIDC flow
const login = () => {
  const authUrl = new URL('https://auth.dev.localhost/oauth/v2/authorize');
  authUrl.searchParams.set('client_id', CLIENT_ID);
  authUrl.searchParams.set('redirect_uri', `${window.location.origin}/callback`);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', 'openid email profile');
  window.location.href = authUrl.toString();
};

// Logout: revoke token and redirect
const logout = async () => {
  await fetch('/api/auth/logout', { method: 'POST' });
  window.location.href = '/';
};
```

### Frontend Routes

**File:** `/Users/nicole/Documents/seance-signaling/landing-page/src/App.tsx`

Routes:
- `/` - Home (public)
- `/login` - Redirects to Zitadel OIDC flow, then `/dashboard`
- `/signup` - Redirects to Zitadel signup, then `/dashboard`
- `/callback` - **NEW** OIDC callback handler (exchange code for token)
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

**For Zitadel:** Same logic, but authentication check uses OIDC token validity

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

**CRITICAL FOR ZITADEL:**
- Zitadel MUST provide stable email in token claims
- Email should be in standard `email` claim
- Email should not change (or handle migration if it does)

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

**No Changes Needed** - Stripe integration stays the same

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

**No Changes Needed** - As long as `ctx.user.email` is populated from Zitadel token

---

## Caddy Configuration

**File:** `/Users/nicole/Documents/seance-signaling/Caddyfile`

**Current:**
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

**For Zitadel:**
```caddyfile
# Zitadel instance
{$AUTH_DOMAIN} {
  reverse_proxy localhost:8080  # Zitadel default port
}

# Backend - NO forward_auth needed
# Express validates tokens directly
{$CADDY_DOMAIN} {
  handle {
    reverse_proxy localhost:{$PORT}
  }
}
```

**Note:** With OIDC, forward_auth is not needed. Express validates tokens directly.

---

## Environment Variables

**File:** `/Users/nicole/Documents/seance-signaling/devenv.nix`

**Development (Current):**
```nix
env.AUTH_DOMAIN = "auth.dev.localhost";
env.CADDY_DOMAIN = "backend.dev.localhost";
env.VITE_AUTH_DOMAIN = "auth.dev.localhost";
env.VITE_BACKEND_URL = "https://backend.dev.localhost";
```

**For Zitadel - Add:**
```nix
env.ZITADEL_ISSUER = "https://auth.dev.localhost";
env.ZITADEL_CLIENT_ID = "your-client-id";
env.ZITADEL_CLIENT_SECRET = "your-client-secret";
env.VITE_ZITADEL_CLIENT_ID = "your-client-id";  # Frontend needs this
```

**Production:**
```nix
profiles.prod.module = {
  env.AUTH_DOMAIN = "auth.seance.dev";
  env.ZITADEL_ISSUER = "https://auth.seance.dev";
  # ... same variables with prod domains
};
```

**Stripe (in .env - no changes):**
```bash
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_ID=price_...
```

---

## Redis Usage

**Services:**
- **Authelia (current):** Stores encrypted session data
  - Key format: `authelia-session:${sessionId}`
  - Data: Encrypted session blob (cannot be read directly)

- **Zitadel (future):** Optional token storage
  - Can use Redis for token caching (optional)
  - Or use Zitadel's built-in database

- **Stripe (unchanged):** Stores subscription data
  - Key format: `user:${email}:subscription`
  - Data: JSON with subscription details

**Configuration:**
- Host: localhost
- Port: 6379
- Persistence: Enabled (RDB snapshots)

---

## Zitadel Migration Plan

### Phase 1: Setup Zitadel

1. **Install Zitadel:**
   ```nix
   # Add to devenv.nix
   packages = [ pkgs.zitadel ];

   processes.zitadel = {
     exec = ''
       ${lib.getExe pkgs.zitadel} start-from-init \
         --config ./zitadel-config.yaml \
         --steps ./zitadel-init-steps.yaml
     '';
   };
   ```

2. **Configure Zitadel:**
   - Create `zitadel-config.yaml`
   - Set external domain: `auth.dev.localhost`
   - Use PostgreSQL or embedded CockroachDB
   - Configure SMTP for email verification (optional for dev)

3. **Create Zitadel Project:**
   - Create new project "Seance"
   - Create application (Web, OIDC)
   - Set redirect URIs: `https://dev.localhost/callback`, `https://backend.dev.localhost/callback`
   - Enable self-service registration
   - Note CLIENT_ID and CLIENT_SECRET

4. **Configure Roles:**
   - Create role: `admin`
   - Create role: `user` (default for all users)
   - Map roles to custom claims in token

### Phase 2: Backend Integration

1. **Install Dependencies:**
   ```bash
   cd backend-trpc
   npm install openid-client jsonwebtoken
   ```

2. **Replace `auth/session.ts`:**
   ```typescript
   import { Issuer, TokenSet } from 'openid-client';
   import jwt from 'jsonwebtoken';

   // Initialize OIDC client
   const issuer = await Issuer.discover(process.env.ZITADEL_ISSUER!);
   const client = new issuer.Client({
     client_id: process.env.ZITADEL_CLIENT_ID!,
     client_secret: process.env.ZITADEL_CLIENT_SECRET!,
   });

   export interface AutheliaUser {
     id: string;      // sub claim
     email: string;   // email claim
     groups: string[]; // roles from custom claim
   }

   export async function validateSession(token: string): Promise<AutheliaUser | null> {
     try {
       // Introspect token with Zitadel
       const tokenSet = await client.introspect(token);

       if (!tokenSet.active) {
         return null;
       }

       // Or validate JWT locally (faster)
       const jwks = await client.jwksStore.get();
       const decoded = jwt.verify(token, jwks, {
         algorithms: ['RS256'],
         issuer: process.env.ZITADEL_ISSUER,
       });

       return {
         id: decoded.sub,
         email: decoded.email,
         groups: decoded['urn:zitadel:iam:org:project:roles'] || [],
       };
     } catch (error) {
       console.error('Token validation error:', error);
       return null;
     }
   }
   ```

3. **Update `trpc/context.ts`:**
   ```typescript
   export async function createContext({ req, res }: CreateExpressContextOptions) {
     // Try Authorization header first
     const authHeader = req.headers.authorization;
     let token = authHeader?.replace('Bearer ', '');

     // Fallback to cookie
     if (!token) {
       token = req.cookies['seance_token'];
     }

     const user = await validateSession(token);

     return { req, res, user };
   }
   ```

4. **Add OIDC Callback Endpoint:**
   ```typescript
   // In backend-trpc/src/index.ts
   app.get('/auth/callback', async (req, res) => {
     const { code } = req.query;

     try {
       const tokenSet = await client.callback(
         'https://backend.dev.localhost/auth/callback',
         { code },
         { code_verifier: req.session.codeVerifier } // If using PKCE
       );

       // Store token in httpOnly cookie
       res.cookie('seance_token', tokenSet.access_token, {
         httpOnly: true,
         secure: true,
         sameSite: 'lax',
         domain: 'dev.localhost',
         maxAge: tokenSet.expires_in * 1000,
       });

       res.redirect('/dashboard');
     } catch (error) {
       console.error('OAuth callback error:', error);
       res.status(500).send('Authentication failed');
     }
   });
   ```

### Phase 3: Frontend Integration

1. **Update `auth-context.tsx`:**
   ```typescript
   const login = () => {
     const authUrl = new URL(`https://${authDomain}/oauth/v2/authorize`);
     authUrl.searchParams.set('client_id', import.meta.env.VITE_ZITADEL_CLIENT_ID);
     authUrl.searchParams.set('redirect_uri', `${window.location.origin}/callback`);
     authUrl.searchParams.set('response_type', 'code');
     authUrl.searchParams.set('scope', 'openid email profile');
     authUrl.searchParams.set('prompt', 'login'); // Force login
     window.location.href = authUrl.toString();
   };

   const logout = async () => {
     // Revoke token
     await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });

     // Redirect to Zitadel logout
     const logoutUrl = new URL(`https://${authDomain}/oidc/v1/end_session`);
     logoutUrl.searchParams.set('post_logout_redirect_uri', window.location.origin);
     window.location.href = logoutUrl.toString();
   };
   ```

2. **Add `/callback` Route:**
   ```typescript
   // New page: landing-page/pages/Callback.tsx
   export default function Callback() {
     const navigate = useNavigate();
     const [searchParams] = useSearchParams();

     useEffect(() => {
       const code = searchParams.get('code');
       if (code) {
         // Exchange code for token via backend
         fetch('/auth/callback' + window.location.search, {
           credentials: 'include'
         }).then(() => {
           navigate('/dashboard');
         });
       }
     }, []);

     return <div>Completing login...</div>;
   }
   ```

3. **Update `Login.tsx` and `Signup.tsx`:**
   ```typescript
   // Login.tsx
   useEffect(() => {
     if (isAuthenticated) {
       navigate('/dashboard');
       return;
     }

     const authUrl = new URL(`https://${authDomain}/oauth/v2/authorize`);
     authUrl.searchParams.set('client_id', import.meta.env.VITE_ZITADEL_CLIENT_ID);
     authUrl.searchParams.set('redirect_uri', `${window.location.origin}/callback`);
     authUrl.searchParams.set('response_type', 'code');
     authUrl.searchParams.set('scope', 'openid email profile');
     authUrl.searchParams.set('prompt', 'login');
     window.location.href = authUrl.toString();
   }, [isAuthenticated]);
   ```

   ```typescript
   // Signup.tsx - Same but add register hint
   authUrl.searchParams.set('prompt', 'create'); // Zitadel shows signup form
   ```

### Phase 4: Testing

1. **Test Self-Registration:**
   - Visit `/signup`
   - Should see Zitadel registration form
   - Create new user
   - Should redirect to `/dashboard`

2. **Test Login:**
   - Visit `/login`
   - Login with created user
   - Verify `/api/auth/me` returns correct data

3. **Test Protected Routes:**
   - Visit `/download` without login → should redirect to `/login`
   - Login → should return to `/download`

4. **Test Stripe Integration:**
   - Login
   - Visit `/checkout`
   - Subscribe
   - Verify subscription saved with correct email
   - Visit `/download` → should allow download

5. **Test RBAC:**
   - Create admin user in Zitadel with `admin` role
   - Test `adminProcedure` endpoints
   - Verify regular users can't access admin endpoints

### Phase 5: Production Deployment

1. **Update Production Config:**
   - Set `ZITADEL_ISSUER=https://auth.seance.dev`
   - Update redirect URIs in Zitadel project
   - Use production CLIENT_ID and CLIENT_SECRET

2. **Migrate Existing Users:**
   - Export emails from `authelia-users.yml`
   - Send invitation emails via Zitadel
   - Or create accounts programmatically via Zitadel API

3. **Remove Authelia:**
   - Stop authelia process
   - Remove `authelia-config.yml`
   - Remove `authelia-users.yml`
   - Clean up Authelia data in `/tmp/authelia/`

---

## Critical Migration Points for Zitadel

### 1. Email Address is Critical
**All Stripe integration depends on email being stable**

Zitadel Provides:
- Email in standard `email` claim ✓
- Email verification (optional but recommended)
- Email is stable and primary identifier ✓

### 2. Session Validation Changes
**From:** Call Authelia `/api/verify`
**To:** Validate OIDC token via introspection or JWT verification

**Files to Update:**
- `backend-trpc/src/auth/session.ts` - Complete rewrite
- Return same `{ id, email, groups }` structure

### 3. Frontend Login/Logout
**From:** Redirect to Authelia with `?rd=` param
**To:** OIDC authorization code flow

**Files to Update:**
- `landing-page/lib/auth-context.tsx` - login() and logout()
- `landing-page/pages/Login.tsx` - Redirect to OIDC
- `landing-page/pages/Signup.tsx` - Redirect with register prompt
- **NEW:** `landing-page/pages/Callback.tsx` - Handle OIDC callback

### 4. Token Storage
**Options:**
1. **HttpOnly Cookie** (Recommended) - Most secure
2. **LocalStorage** - Easier for SPA, less secure
3. **Session Storage** - Cleared on tab close

**Recommendation:** HttpOnly cookie with same domain as Authelia (`dev.localhost`)

### 5. RBAC / Groups
**From:** Authelia groups in headers
**To:** Zitadel roles in token claims

Zitadel provides:
- Custom claims for roles: `urn:zitadel:iam:org:project:roles`
- Can map to `groups` array in your code
- More flexible than Authelia

### 6. Self-Service Registration
**This is the reason for migration!**

Zitadel provides:
- Built-in registration UI
- Email verification
- Password reset
- Profile management
- All configurable via admin UI

### 7. Caddy Configuration
**From:** Forward auth to Authelia
**To:** Simple reverse proxy (no forward auth)

Express validates tokens directly, no need for Caddy middleware.

### 8. Development Experience
Zitadel Advantages:
- Web UI for user management
- No need to edit YAML files
- Built-in admin console
- API for programmatic user management
- SMTP integration for emails

---

## Testing Checklist After Migration

1. [ ] User can sign up dynamically (NEW!)
2. [ ] User can log in and access `/dashboard`
3. [ ] Token cookie works across all subdomains
4. [ ] `/api/auth/me` returns correct user data with email
5. [ ] Protected routes redirect to login
6. [ ] Logout clears token and redirects properly
7. [ ] Stripe checkout creates customer with correct email
8. [ ] Stripe webhook updates subscription in Redis
9. [ ] `/download` checks subscription status correctly
10. [ ] Customer portal works (finds customer by email)
11. [ ] Admin users have `admin` role in token
12. [ ] Regular users don't have admin access
13. [ ] Auto-updates still work (`/updates/*` endpoints public)
14. [ ] Email verification works (if enabled)
15. [ ] Password reset flow works

---

## Zitadel Setup Checklist

### Initial Setup
- [ ] Install Zitadel (via devenv.nix)
- [ ] Create instance at `auth.dev.localhost`
- [ ] Create organization "Seance"
- [ ] Create project "Seance"
- [ ] Create application (Web, OIDC)
- [ ] Configure redirect URIs
- [ ] Enable self-service registration
- [ ] Configure token lifetime (1h recommended)
- [ ] Set up refresh token (7 days recommended)

### Role Configuration
- [ ] Create role: `admin`
- [ ] Create role: `user` (default)
- [ ] Enable role claims in token
- [ ] Set custom claim name: `groups` (for compatibility)

### Email Configuration (Optional for dev)
- [ ] Configure SMTP provider
- [ ] Enable email verification
- [ ] Enable password reset emails
- [ ] Customize email templates

### Security
- [ ] Enable PKCE (recommended)
- [ ] Configure CORS for your domains
- [ ] Set token expiration policies
- [ ] Configure session policies
- [ ] Enable audit logs

---

## Backup Current State

Before migration, backup:
1. `authelia-config.yml`
2. `authelia-users.yml`
3. `backend-trpc/src/auth/session.ts`
4. `landing-page/lib/auth-context.tsx`
5. Redis data: `redis-cli SAVE` to create dump.rdb
6. Document all user emails for migration

---

## Zitadel Resources

**Documentation:**
- Official Docs: https://zitadel.com/docs
- OIDC Guide: https://zitadel.com/docs/guides/integrate/login/oidc
- Self-Service: https://zitadel.com/docs/guides/manage/console/users
- Node.js SDK: https://zitadel.com/docs/sdk-examples/nodejs

**Key Endpoints:**
- Authorization: `https://auth.dev.localhost/oauth/v2/authorize`
- Token: `https://auth.dev.localhost/oauth/v2/token`
- Introspection: `https://auth.dev.localhost/oauth/v2/introspect`
- Userinfo: `https://auth.dev.localhost/oidc/v1/userinfo`
- JWKS: `https://auth.dev.localhost/.well-known/openid-configuration`
- End Session: `https://auth.dev.localhost/oidc/v1/end_session`

---

## Questions for Implementation

1. ✓ Does Zitadel support OAuth2/OIDC? **YES - Native**
2. ✓ Can users self-register? **YES - Built-in**
3. ✓ How are sessions validated? **OIDC token introspection or JWT verification**
4. ✓ Cookie domain support? **YES - Standard OAuth cookies**
5. ✓ How are groups/roles exposed? **Custom claims in token**
6. ✓ Single binary option? **YES - Can run standalone**
7. ✓ Email stability? **YES - Email is primary identifier**
8. ✓ Caddy configuration? **Simple reverse proxy, no forward auth needed**

---

## Migration Priority

**HIGH** - User registration is a core requirement for public launch

**Estimated Effort:**
- Phase 1 (Setup): 2-4 hours
- Phase 2 (Backend): 4-6 hours
- Phase 3 (Frontend): 2-4 hours
- Phase 4 (Testing): 2-3 hours
- Phase 5 (Production): 1-2 hours

**Total: ~1-2 days**

---

## Why Zitadel Over Kanidm

| Feature | Zitadel | Kanidm | Winner |
|---------|---------|--------|--------|
| OAuth2/OIDC | Native, first-class | Limited support | Zitadel |
| Self-registration | Built-in UI | Complex setup | Zitadel |
| Web app focus | Designed for SaaS | Enterprise LDAP | Zitadel |
| Documentation | Excellent | Good | Zitadel |
| API | RESTful + gRPC | RESTful | Tie |
| Email handling | First-class | Secondary | Zitadel |
| RBAC | Flexible roles | Groups only | Zitadel |
| Development UX | Admin console | CLI-focused | Zitadel |
| Community | Very active | Growing | Zitadel |
| Single binary | Yes | Yes | Tie |

**Conclusion: Zitadel is the clear winner for your use case**
