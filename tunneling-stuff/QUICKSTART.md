# Quick Start Guide

Test the tunnel in 4 terminal windows:

## Terminal 1: Relay Server

```bash
cd relay
go mod download
go run main.go
```

Wait for: `🔌 Tunnel Relay Server starting on port 8080`

## Terminal 2: Test WebSocket Server

```bash
cd tunneling-stuff
node test-websocket-server.js
```

Wait for: `🧪 Test WebSocket server running on ws://localhost:1234`

## Terminal 3: Agent

```bash
cd agent
npm install
ROOM_ID=test-room LOCAL_PORT=1234 npm run dev
```

Wait for: `[Agent] Tunneling: localhost:1234 -> relay`

## Terminal 4: Test Client

```bash
# Install wscat if you don't have it
npm install -g wscat

# Connect through the relay
wscat -c "ws://localhost:8080/client?room=test-room"
```

Type anything and press Enter. You should see:
1. Message goes through relay
2. Tunnels to agent
3. Forwards to local WebSocket server
4. Server echoes back
5. Response comes back through the tunnel

## Expected Flow

```
You type "hello"
  ↓
[wscat] --WebSocket--> [Relay :8080]
                          ↓
                       [yamux stream]
                          ↓
                       [Agent] --TCP--> [Local WS Server :1234]
                                           ↓
                                        Echoes back
                                           ↓
                       [Agent] <--TCP-- [Local WS Server]
                          ↓
                       [yamux stream]
                          ↓
[wscat] <--WebSocket-- [Relay]

You see "Echo: hello"
```

## Troubleshooting

**"Connection refused" on agent:**
- Make sure test WebSocket server is running on port 1234

**"Room not found" on client:**
- Make sure agent connected successfully first
- Check room IDs match

**No echo response:**
- Check all 3 processes are running
- Check logs for errors
