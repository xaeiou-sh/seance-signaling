import WebSocket from 'ws';
import { createConnection, Socket } from 'net';

export interface TunnelAgentConfig {
  relayUrl: string;        // e.g., "ws://localhost:8080"
  roomId: string;          // Unique identifier for this room
  localPort: number;       // Port where Y-Websocket server is running (e.g., 1234)
  localHost?: string;      // Defaults to 'localhost'
}

export class TunnelAgent {
  private config: Required<TunnelAgentConfig>;
  private relayConnection: WebSocket | null = null;
  private streams: Map<number, Socket> = new Map(); // streamId -> TCP connection
  private reconnectTimer: NodeJS.Timeout | null = null;

  constructor(config: TunnelAgentConfig) {
    this.config = {
      ...config,
      localHost: config.localHost || 'localhost',
    };
  }

  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      const url = `${this.config.relayUrl}/agent?room=${this.config.roomId}`;

      console.log(`[Agent] Connecting to relay: ${url}`);

      this.relayConnection = new WebSocket(url);

      this.relayConnection.on('open', () => {
        console.log(`[Agent] Connected to relay for room: ${this.config.roomId}`);
        console.log(`[Agent] Tunneling: localhost:${this.config.localPort} -> relay`);
        resolve();
      });

      this.relayConnection.on('error', (err: Error) => {
        console.error('[Agent] Connection error:', err.message);
        reject(err);
      });

      this.relayConnection.on('close', () => {
        console.log('[Agent] Disconnected from relay');
        this.cleanup();
        this.scheduleReconnect();
      });

      this.relayConnection.on('message', async (data: Buffer) => {
        // For now, simple implementation without yamux-js
        // Each incoming message is a new connection request
        // We'll handle this by creating a new TCP connection to local server
        this.handleIncomingStream(data);
      });
    });
  }

  private async handleIncomingStream(data: Buffer): Promise<void> {
    // Connect to local Y-Websocket server
    const localConn = createConnection({
      host: this.config.localHost,
      port: this.config.localPort,
    });

    localConn.on('connect', () => {
      console.log(`[Agent] Opened connection to local server at ${this.config.localHost}:${this.config.localPort}`);

      // Forward initial data to local server
      localConn.write(data);
    });

    localConn.on('data', (data: Buffer) => {
      // Forward data from local server back to relay
      if (this.relayConnection && this.relayConnection.readyState === WebSocket.OPEN) {
        this.relayConnection.send(data);
      }
    });

    localConn.on('error', (err: Error) => {
      console.error('[Agent] Local connection error:', err.message);
      localConn.destroy();
    });

    localConn.on('close', () => {
      console.log('[Agent] Local connection closed');
    });

    // Store connection for cleanup
    const connId = Math.random();
    this.streams.set(connId, localConn);

    localConn.on('close', () => {
      this.streams.delete(connId);
    });
  }

  private cleanup(): void {
    // Close all active streams
    for (const stream of this.streams.values()) {
      try {
        stream.destroy();
      } catch (err) {
        // Ignore
      }
    }
    this.streams.clear();
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) {
      return;
    }

    console.log('[Agent] Reconnecting in 5 seconds...');
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.start().catch((err: Error) => {
        console.error('[Agent] Reconnect failed:', err.message);
      });
    }, 5000);
  }

  stop(): void {
    console.log('[Agent] Stopping...');

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.relayConnection) {
      this.relayConnection.close();
      this.relayConnection = null;
    }

    this.cleanup();
  }
}

// CLI usage (only when run directly)
if (typeof require !== 'undefined' && require.main === module) {
  const relayUrl = process.env.RELAY_URL || 'ws://localhost:8080';
  const roomId = process.env.ROOM_ID || 'test-room';
  const localPort = parseInt(process.env.LOCAL_PORT || '1234', 10);

  const agent = new TunnelAgent({
    relayUrl,
    roomId,
    localPort,
  });

  agent.start().catch((err: Error) => {
    console.error('[Agent] Failed to start:', err);
    process.exit(1);
  });

  process.on('SIGINT', () => {
    console.log('\n[Agent] Shutting down...');
    agent.stop();
    process.exit(0);
  });
}
