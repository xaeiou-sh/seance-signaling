# Zitadel Setup Guide

**Status:** Migration from Authelia to Zitadel complete ✓

This document explains how to set up and test the new Zitadel OIDC authentication.

---

## What Changed

### Removed: Authelia
- Static YAML user definitions
- No self-service registration
- Session-based auth with forward_auth

### Added: Zitadel
- Dynamic user registration (self-service signup)
- OIDC/OAuth2 standard flow
- JWT-based authentication
- Better RBAC with roles and claims

---

## First-Time Setup

### Step 1: Start Services

```bash
devenv up
```

All services will start:
- PostgreSQL (for Zitadel)
- Zitadel (auth.dev.localhost)
- Backend (backend.dev.localhost)
- Frontend (dev.localhost)
- Valkey/Redis (for Stripe data)

### Step 2: Access Zitadel Console

1. Visit `https://auth.dev.localhost`
2. Login with default admin credentials:
   - **Username:** `admin`
   - **Password:** `ChangeThisPassword123!`
3. Change the admin password immediately

### Step 3: Create OIDC Application

1. In Zitadel console, go to **Projects**
2. Create a new project called **"Seance"**
3. Inside the project, create a new **Application**:
   - **Name:** Seance Web App
   - **Type:** Web
   - **Authentication Method:** PKCE (or Code if PKCE not available)

4. Set redirect URIs:
   ```
   https://backend.dev.localhost/auth/callback
   https://backend.seance.dev/auth/callback
   ```

5. Set post-logout redirect URIs:
   ```
   https://dev.localhost
   https://seance.dev
   ```

6. Enable these grant types:
   - Authorization Code
   - Refresh Token

7. Enable these scopes:
   - `openid`
   - `email`
   - `profile`

8. Save the application

### Step 4: Get Client Credentials

After creating the application:

1. Copy the **Client ID** (looks like: `123456789012345678@seance`)
2. Generate a **Client Secret** (if using Code flow)
3. Save both values

### Step 5: Configure Environment Variables

Update `devenv.nix` or create a `.env` file in the backend:

```nix
env.ZITADEL_CLIENT_ID = "YOUR_CLIENT_ID_HERE";
env.ZITADEL_CLIENT_SECRET = "YOUR_CLIENT_SECRET_HERE";
env.VITE_ZITADEL_CLIENT_ID = "YOUR_CLIENT_ID_HERE";
```

Or in `.env`:
```bash
ZITADEL_CLIENT_ID=YOUR_CLIENT_ID_HERE
ZITADEL_CLIENT_SECRET=YOUR_CLIENT_SECRET_HERE
VITE_ZITADEL_CLIENT_ID=YOUR_CLIENT_ID_HERE
```

### Step 6: Restart Services

```bash
# Stop devenv (Ctrl+C)
devenv up
```

---

## Testing the Migration

### Test 1: Self-Registration (NEW!)

1. Visit `https://dev.localhost`
2. Click **Sign Up**
3. You should be redirected to Zitadel registration page
4. Fill in:
   - Email
   - Password
   - First name / Last name
5. Complete registration
6. You should be redirected to `/dashboard`

### Test 2: Login

1. Logout if logged in
2. Visit `https://dev.localhost/login`
3. Enter your email and password
4. You should be redirected to `/dashboard`

### Test 3: Protected Routes

1. Logout
2. Try to visit `https://dev.localhost/dashboard`
3. Should redirect to login
4. After login, should return to dashboard

### Test 4: Session Persistence

1. Login
2. Refresh the page
3. Should stay logged in (cookie persists)

### Test 5: Stripe Integration

1. Login
2. Visit `/checkout`
3. Complete a test subscription
4. Verify subscription is stored with your email in Redis:
   ```bash
   redis-cli GET "user:your-email@example.com:subscription"
   ```
5. Visit `/download`
6. Should have access (subscription active)

### Test 6: Logout

1. Click logout
2. Should clear cookies
3. Should redirect to home page
4. Visiting `/dashboard` should redirect to login

### Test 7: RBAC (Roles)

1. In Zitadel, go to your project
2. Create a role called `admin`
3. Assign this role to your user
4. The role will appear in the JWT token
5. Backend `adminProcedure` will check for this role

---

## Troubleshooting

### "OIDC not configured" error

Check that these environment variables are set:
```bash
echo $ZITADEL_ISSUER
echo $ZITADEL_CLIENT_ID
echo $ZITADEL_CLIENT_SECRET
echo $VITE_ZITADEL_CLIENT_ID
```

If empty, add them to `devenv.nix` or `.env` and restart.

### "Invalid redirect_uri" error

Make sure you added all redirect URIs in Zitadel:
- `https://backend.dev.localhost/auth/callback`
- `https://backend.seance.dev/auth/callback`

### "Token validation failed" error

Check Zitadel logs:
```bash
# View Zitadel process logs
devenv logs zitadel
```

Common causes:
- Clock skew (JWT expiration)
- Wrong issuer URL
- Misconfigured application in Zitadel

### Can't access Zitadel console

Check PostgreSQL is running:
```bash
psql -h localhost -p 5432 -U zitadel -d zitadel
```

Check Zitadel process:
```bash
devenv ps
```

### Reset Everything

```bash
# Stop devenv
clear-zitadel  # Drops database and clears state
devenv up      # Restart fresh
```

---

## Architecture Overview

### Authentication Flow

1. User visits `/login` or `/signup`
2. Frontend redirects to Zitadel OIDC authorize endpoint:
   ```
   https://auth.dev.localhost/oauth/v2/authorize
     ?client_id=...
     &redirect_uri=https://backend.dev.localhost/auth/callback
     &response_type=code
     &scope=openid email profile
     &prompt=login|create
   ```
3. User authenticates with Zitadel
4. Zitadel redirects to backend callback with authorization code
5. Backend exchanges code for access token
6. Backend stores token in httpOnly cookie (`seance_token`)
7. Backend redirects to `/dashboard`
8. Frontend makes API calls with cookie
9. Backend validates JWT using JWKS

### Token Storage

- **Access Token:** httpOnly cookie `seance_token` (1 hour expiry)
- **Refresh Token:** httpOnly cookie `seance_refresh_token` (7 days expiry)
- **Cookie Domain:** `dev.localhost` (shared across subdomains)

### Session Validation

Backend validates tokens by:
1. Extracting from `Authorization: Bearer <token>` header or `seance_token` cookie
2. Verifying JWT signature using Zitadel JWKS
3. Checking issuer, expiration, and required claims
4. Extracting user info (`sub`, `email`, roles)

### Stripe Integration

**No changes needed!** Stripe still uses email for customer lookup:
```typescript
ctx.user.email // From Zitadel JWT
```

---

## Files Changed

### Backend
- `backend-trpc/package.json` - Added `jose`, `openid-client`
- `backend-trpc/src/auth/session.ts` - JWT validation instead of Authelia API
- `backend-trpc/src/trpc/context.ts` - Extract token from header or cookie
- `backend-trpc/src/index.ts` - Added `/auth/callback` and `/auth/logout` endpoints

### Frontend
- `landing-page/lib/auth-context.tsx` - OIDC login/logout flow
- `landing-page/pages/Login.tsx` - Redirect to Zitadel authorize endpoint
- `landing-page/pages/Signup.tsx` - Redirect with `prompt=create`

### Infrastructure
- `devenv.nix` - Added Zitadel process and PostgreSQL service
- `Caddyfile` - Removed forward_auth, proxy Zitadel on port 8080
- `zitadel-config.yaml` - Zitadel configuration (not currently used, using env vars)

### Deprecated (can be removed after testing)
- `authelia-config.yml`
- `authelia-users.yml`
- Authelia process in devenv.nix (commented out or removed)

---

## Production Deployment

### Before Deploying

1. Set production environment variables:
   ```bash
   ZITADEL_ISSUER=https://auth.seance.dev
   ZITADEL_CLIENT_ID=<prod-client-id>
   ZITADEL_CLIENT_SECRET=<prod-client-secret>
   VITE_ZITADEL_CLIENT_ID=<prod-client-id>
   ```

2. Create production Zitadel instance or project

3. Update redirect URIs to production domains

4. Use strong master key for Zitadel:
   ```bash
   ZITADEL_MASTERKEY=$(openssl rand -base64 32)
   ```

5. Use external PostgreSQL (not embedded)

6. Enable email verification in Zitadel

7. Configure SMTP for password resets

### Migrating Existing Users

Zitadel doesn't support importing password hashes from Authelia. Options:

1. **Send invitations:** Use Zitadel API to create users and send email invitations
2. **Password reset:** Create accounts and force password reset on first login
3. **Manual migration:** Users re-register with same email

---

## Next Steps

- [ ] Test all authentication flows
- [ ] Test Stripe integration with new auth
- [ ] Configure Zitadel email verification
- [ ] Set up SMTP for password resets
- [ ] Create admin user with `admin` role
- [ ] Test RBAC with admin procedures
- [ ] Deploy to production
- [ ] Migrate existing users
- [ ] Remove old Authelia files

---

## Useful Commands

```bash
# Clear Zitadel data and restart
clear-zitadel

# View Zitadel logs
devenv logs zitadel

# Check PostgreSQL
psql -h localhost -p 5432 -U zitadel -d zitadel

# Check Redis keys
redis-cli KEYS "user:*"

# Test token validation (from backend)
curl -H "Authorization: Bearer <token>" https://backend.dev.localhost/api/auth/me
```

---

## Resources

- [Zitadel Documentation](https://zitadel.com/docs)
- [OIDC Integration Guide](https://zitadel.com/docs/guides/integrate/login/oidc)
- [Zitadel Self-Hosting](https://zitadel.com/docs/self-hosting/deploy/compose)
- [jose Library (JWT)](https://github.com/panva/jose)
