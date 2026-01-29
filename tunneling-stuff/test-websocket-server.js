// Simple WebSocket echo server for testing the tunnel
// Run this to simulate a Y-Websocket server running locally

const WebSocket = require('ws');

const server = new WebSocket.Server({ port: 1234 });

server.on('connection', (ws) => {
  console.log('[Test Server] Client connected');

  ws.on('message', (data) => {
    const message = data.toString();
    console.log('[Test Server] Received:', message);

    // Echo it back with a prefix
    ws.send(`Echo: ${message}`);
  });

  ws.on('close', () => {
    console.log('[Test Server] Client disconnected');
  });

  ws.on('error', (err) => {
    console.error('[Test Server] Error:', err.message);
  });

  // Send welcome message
  ws.send('Welcome to test WebSocket server!');
});

console.log('🧪 Test WebSocket server running on ws://localhost:1234');
console.log('   Waiting for connections...');
