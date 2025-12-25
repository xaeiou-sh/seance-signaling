# Seance Coordinator

A self-hosted WebRTC signaling server for [Seance Desktop](https://github.com/yourusername/seance-desktop), exposed securely via Cloudflare Tunnel.

## What is this?

This repository provides the infrastructure for real-time peer-to-peer collaboration in Seance Desktop. It runs:

- **y-webrtc signaling server** - Helps peers discover each other for WebRTC connections
- **Cloudflare Tunnel** - Securely exposes the server to the internet with automatic HTTPS

## Quick Start

```bash
# 1. Enter the development environment (if using devenv)
direnv allow

# 2. Follow the setup guide to configure Cloudflare Tunnel
cat SETUP.md

# 3. Start the services
signaling-start

# 4. Check status
signaling-status
```

## Why Cloudflare Tunnel?

- **No port forwarding required** - Works behind NAT/firewall
- **Free SSL/TLS** - Automatic HTTPS/WSS support
- **No hosting costs** - Run on your local machine
- **Easy management** - Simple configuration and monitoring
- **Great learning experience** - Understand modern edge networking

## Project Structure

```
.
├── docker-compose.yml              # Service orchestration
├── cloudflared/
│   ├── config.yml.template         # Tunnel configuration template
│   ├── config.yml                  # Your actual config (git-ignored)
│   └── credentials.json            # Tunnel credentials (git-ignored)
├── devenv.nix                      # Development environment
└── SETUP.md                        # Detailed setup instructions
```

## Usage

Once configured, your signaling server will be available at your chosen hostname (e.g., `wss://signaling.yourdomain.com`).

Use it in your Seance Desktop configuration:

```javascript
{
  signaling: ['wss://signaling.yourdomain.com']
}
```

## Commands (in devenv shell)

- `signaling-start` - Start all services
- `signaling-stop` - Stop all services
- `signaling-logs` - View logs
- `signaling-status` - Check service status

## Documentation

See [SETUP.md](SETUP.md) for detailed setup instructions including:
- Installing and configuring Cloudflare Tunnel
- Creating DNS records
- Testing the connection
- Troubleshooting

## Architecture

```
Seance Desktop (Browser)
         ↓ wss://
    Cloudflare Edge
         ↓ tunnel
    cloudflared container
         ↓ http://
    y-webrtc signaling server
```

## Requirements

- Docker & Docker Compose
- Cloudflare account (free tier is fine)
- Domain managed by Cloudflare (or use free `.cfargotunnel.com` subdomain)

## License

MIT
