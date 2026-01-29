# Seance Tunnel

Reverse tunnel implementation for exposing local Y-Websocket servers through a public relay.

## Architecture

```
[Desktop App] --WebSocket--> [Relay Server] <--WebSocket-- [Remote Clients]
   (Agent)                       (Go)
     |
     v
[Y-Websocket Server]
  (localhost:1234)
```

## Components

### 1. Relay Server (Go)

Public server that accepts connections from:
- **Agents** (hosting devices) at `/agent?room=<id>`
- **Clients** (remote users) at `/client?room=<id>`

Uses yamux for multiplexing multiple client connections over a single agent connection.

### 2. Agent (TypeScript)

Runs in the desktop app. Connects to relay and bridges traffic to local Y-Websocket server.

## Testing Locally

### Step 1: Start Relay Server

```bash
cd relay
go mod download
go run main.go
```

Should see:
```
🔌 Tunnel Relay Server starting on port 8080
   Agent endpoint: ws://localhost:8080/agent?room=<room-id>
   Client endpoint: ws://localhost:8080/client?room=<room-id>
```

### Step 2: Start a Test WebSocket Server

For testing, we need a simple WebSocket echo server:

```bash
# Install wscat globally
npm install -g wscat

# Or use a simple Node.js server (see below)
```

Create `test-websocket-server.js`:
```javascript
const WebSocket = require('ws');
const server = new WebSocket.Server({ port: 1234 });

server.on('connection', (ws) => {
  console.log('[Test Server] Client connected');

  ws.on('message', (data) => {
    console.log('[Test Server] Received:', data.toString());
    // Echo it back
    ws.send(`Echo: ${data}`);
  });

  ws.on('close', () => {
    console.log('[Test Server] Client disconnected');
  });
});

console.log('Test WebSocket server running on ws://localhost:1234');
```

Run it:
```bash
node test-websocket-server.js
```

### Step 3: Start Agent

```bash
cd agent
npm install
ROOM_ID=test-room LOCAL_PORT=1234 npm run dev
```

Should see:
```
[Agent] Connecting to relay: ws://localhost:8080/agent?room=test-room
[Agent] Connected to relay for room: test-room
[Agent] Tunneling: localhost:1234 -> relay
```

### Step 4: Connect a Client

```bash
# Install wscat if you haven't
npm install -g wscat

# Connect through the relay
wscat -c "ws://localhost:8080/client?room=test-room"
```

Type messages - they should be tunneled through the relay to your local server and echoed back.

## Current Limitations (MVP)

- ⚠️ Simple stream handling (not full yamux on agent side yet)
- ⚠️ No authentication
- ⚠️ No TLS (use ws:// not wss://)
- ⚠️ Single relay instance (no load balancing)

This is intentionally minimal to prove the concept works before adding complexity.

## Next Steps

1. ✅ Get basic tunneling working
2. Add proper yamux multiplexing on agent side
3. Add room authentication (tokens)
4. Add TLS support (wss://)
5. Add health checks and metrics
6. Integrate agent into desktop app
7. Deploy relay to Kubernetes
8. Add multiple relay regions

## Integration Notes

**DO NOT** integrate this into the main app until we verify:
- Relay can handle concurrent connections
- Agent successfully bridges to Y-Websocket
- No weird networking issues
- Performance is acceptable

Keep it standalone and testable first.
