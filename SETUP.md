# Seance Coordinator Setup

This repository runs a y-webrtc signaling server exposed via Cloudflare Tunnel for secure, publicly accessible WebRTC signaling.

## Prerequisites

1. **Docker and Docker Compose** installed on your system
2. **Cloudflare account** (free tier works fine)
3. A **domain managed by Cloudflare** (or use a free `.cfargotunnel.com` subdomain)

## Quick Start

### 1. Install Cloudflare Tunnel CLI (cloudflared)

#### Linux/macOS:
```bash
# Download and install cloudflared
curl -L --output cloudflared.deb https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
sudo dpkg -i cloudflared.deb
```

#### Or use your package manager:
```bash
# Arch Linux
sudo pacman -S cloudflared

# macOS
brew install cloudflared
```

### 2. Authenticate with Cloudflare

```bash
cloudflared tunnel login
```

This opens a browser window. Select the domain you want to use.

### 3. Create a Tunnel

```bash
# Create a new tunnel (choose a memorable name)
cloudflared tunnel create seance-signaling

# This creates a credentials file. Note the Tunnel ID shown in the output!
```

The credentials file will be saved to `~/.cloudflared/`. You'll need to copy it to this repo.

### 4. Configure the Tunnel

```bash
# Copy the credentials file to this repo
mkdir -p cloudflared
cp ~/.cloudflared/YOUR_TUNNEL_ID.json cloudflared/credentials.json

# Copy the template config and edit it
cp cloudflared/config.yml.template cloudflared/config.yml
```

Now edit `cloudflared/config.yml`:

```yaml
tunnel: YOUR_TUNNEL_ID  # Replace with your actual tunnel ID
credentials-file: /etc/cloudflared/credentials.json

ingress:
  # Replace YOUR_TUNNEL_HOSTNAME with your desired hostname
  - hostname: signaling.yourdomain.com
    service: http://signaling:4444

  - service: http_status:404
```

### 5. Create DNS Record

```bash
# Route your hostname to the tunnel
cloudflared tunnel route dns seance-signaling signaling.yourdomain.com
```

Or use a free `.cfargotunnel.com` subdomain:
```bash
cloudflared tunnel route dns seance-signaling seance-signaling.cfargotunnel.com
```

### 6. Start the Services

```bash
# Start both the signaling server and cloudflare tunnel
docker compose up -d

# View logs
docker compose logs -f
```

### 7. Test the Connection

Your signaling server should now be accessible at:
- `wss://signaling.yourdomain.com` (or your chosen hostname)

Test it:
```bash
# Check if the WebSocket endpoint is reachable
curl -I https://signaling.yourdomain.com
```

## Configuration

### Signaling Server

The y-webrtc signaling server runs on port 4444 by default. You can change this in `docker-compose.yml`:

```yaml
environment:
  - PORT=4444  # Change to your preferred port
```

### Cloudflare Tunnel Settings

Edit `cloudflared/config.yml` to customize:
- Hostname routing
- Protocol settings
- Additional services

See [Cloudflare Tunnel docs](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/) for advanced configuration.

## Usage in Your Application

Update your y-webrtc configuration to use your tunnel:

```javascript
import * as Y from 'yjs'
import { WebrtcProvider } from 'y-webrtc'

const ydoc = new Y.Doc()

const provider = new WebrtcProvider('your-room-name', ydoc, {
  signaling: ['wss://signaling.yourdomain.com'],
})
```

## Maintenance

### View Logs
```bash
docker compose logs -f
```

### Restart Services
```bash
docker compose restart
```

### Stop Services
```bash
docker compose down
```

### Update Signaling Server
```bash
docker compose pull
docker compose up -d
```

## Troubleshooting

### Tunnel won't start
- Check that `cloudflared/credentials.json` exists and is valid
- Verify the tunnel ID in `cloudflared/config.yml` matches your credentials file
- Check logs: `docker compose logs cloudflared`

### Can't connect to signaling server
- Ensure DNS record is created: `cloudflared tunnel route dns list`
- Check if tunnel is running: `docker compose ps`
- Verify hostname in `cloudflared/config.yml` matches your DNS record
- Test direct connection to signaling server: `curl http://localhost:4444`

### WebSocket connection fails
- Cloudflare Tunnel automatically handles SSL/TLS
- Make sure you're using `wss://` (not `ws://`) in your client
- Check Cloudflare dashboard for any security rules blocking WebSocket connections

## Security Notes

- The `cloudflared/credentials.json` file contains secrets - it's git-ignored
- The tunnel provides automatic HTTPS/WSS via Cloudflare's edge network
- Consider enabling Cloudflare Access for additional authentication if needed

## Architecture

```
┌─────────────────┐
│  Your Client    │
│   (Browser)     │
└────────┬────────┘
         │ wss://
         │
         ▼
┌─────────────────┐
│   Cloudflare    │
│   Edge Network  │
└────────┬────────┘
         │ Tunnel
         │
         ▼
┌─────────────────┐       ┌──────────────────┐
│  cloudflared    │◄──────┤ y-webrtc         │
│  Container      │       │ signaling:4444   │
└─────────────────┘       └──────────────────┘
```

## Additional Resources

- [y-webrtc Documentation](https://github.com/yjs/y-webrtc)
- [Cloudflare Tunnel Documentation](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/)
- [Docker Compose Documentation](https://docs.docker.com/compose/)
