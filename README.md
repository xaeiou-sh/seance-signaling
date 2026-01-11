# Seance Backend Infrastructure

Backend services for Seance desktop app auto-updates and web app hosting.

## What's Here

This repository runs the backend infrastructure for Seance:

- **WebRTC signaling server** (port 4444) - Peer discovery for real-time collaboration
- **Update server** (port 3000) - Desktop app auto-updates via electron-updater
- **Web app hosting** (port 3000) - Static hosting for Seance web version
- **Cloudflare Tunnel** - Secure HTTPS access to local services

All exposed via Cloudflare Tunnel at:
- `backend.seance.dev/signaling` - WebRTC signaling
- `backend.seance.dev/updates` - Desktop app updates
- `app.seance.dev` - Web app

## Quick Start

```bash
# Start all services
cd /Users/nicole/Documents/seance-signaling
devenv up

# Verify services
curl https://backend.seance.dev
open https://app.seance.dev
```

## CI/CD Architecture

```
GitHub Actions (macos-14)
    ↓ builds desktop + web
    ↓ signs with Ed25519 key
    ↓ POST /deploy
seance-backend-hono (localhost:3000)
    ↓ Cloudflare Tunnel
backend.seance.dev + app.seance.dev
```

**Key features:**
- Ed25519 cryptographic signatures (no shared secrets)
- Public keys committed to repo (safe)
- GitHub-hosted runners (zero maintenance)
- Desktop auto-updates every 10 minutes
- Zero .env complexity

## Project Structure

```
.
├── config.yml                      # Builder keys + server config (committed)
├── seance-backend-hono/            # Update server + web hosting
│   └── src/index.ts                # Hono server with /deploy endpoint
├── cloudflared/                    # Cloudflare Tunnel config
├── .keys/                          # Private keys (gitignored)
├── scripts/generate-builder-keys.sh # Key generation helper
└── SETUP.md                        # Complete setup guide
```

## Setup

See [SETUP.md](SETUP.md) for complete instructions.

**TL;DR:**
1. Verify `config.yml` has builder public key
2. Add `BUILDER_PRIVATE_KEY` to GitHub Secrets
3. Run `devenv up`
4. Push to trigger deployment

## Deployment Flow

1. Push code to GitHub
2. GitHub Actions builds on `macos-14` runner
3. Signs deployment payload with Ed25519 private key
4. POSTs artifacts to `backend.seance.dev/deploy`
5. Backend verifies signature with public key from `config.yml`
6. Updates served at `backend.seance.dev/updates`
7. Web app served at `app.seance.dev`

## Security

- **Backend only stores public keys** (in `config.yml`)
- Even if backend is compromised, attacker can't forge deployments
- Multiple builder keys supported for rotation
- Each deployment is cryptographically signed

## Requirements

- Node.js 22+
- devenv (or manually run services)
- Cloudflare account + domain
- GitHub repository with Actions enabled
