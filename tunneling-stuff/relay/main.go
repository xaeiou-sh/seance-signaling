package main

import (
	"fmt"
	"io"
	"log"
	"net/http"
	"sync"
	"time"

	"github.com/gorilla/websocket"
	"github.com/hashicorp/yamux"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		return true // Allow all origins for now (restrict in production)
	},
}

// AgentConnection represents a connected agent (hosting device)
type AgentConnection struct {
	session *yamux.Session
	roomID  string
}

type RelayServer struct {
	agents map[string]*AgentConnection // roomID -> agent
	mu     sync.RWMutex
}

func NewRelayServer() *RelayServer {
	return &RelayServer{
		agents: make(map[string]*AgentConnection),
	}
}

// handleAgent handles incoming agent connections (from hosting device)
func (r *RelayServer) handleAgent(w http.ResponseWriter, req *http.Request) {
	roomID := req.URL.Query().Get("room")
	if roomID == "" {
		http.Error(w, "Missing room parameter", http.StatusBadRequest)
		return
	}

	conn, err := upgrader.Upgrade(w, req, nil)
	if err != nil {
		log.Printf("[Agent] Failed to upgrade connection: %v", err)
		return
	}
	defer conn.Close()

	log.Printf("[Agent] Agent connected for room: %s", roomID)

	// Wrap WebSocket in a net.Conn interface
	wsConn := &websocketConn{conn: conn}

	// Create yamux session (server mode)
	session, err := yamux.Server(wsConn, yamux.DefaultConfig())
	if err != nil {
		log.Printf("[Agent] Failed to create yamux session: %v", err)
		return
	}
	defer session.Close()

	// Register agent
	agent := &AgentConnection{
		session: session,
		roomID:  roomID,
	}

	r.mu.Lock()
	r.agents[roomID] = agent
	r.mu.Unlock()

	defer func() {
		r.mu.Lock()
		delete(r.agents, roomID)
		r.mu.Unlock()
		log.Printf("[Agent] Agent disconnected for room: %s", roomID)
	}()

	// Keep connection alive
	for {
		if session.IsClosed() {
			break
		}
		time.Sleep(1 * time.Second)
	}
}

// handleClient handles incoming client connections (users joining room)
func (r *RelayServer) handleClient(w http.ResponseWriter, req *http.Request) {
	roomID := req.URL.Query().Get("room")
	if roomID == "" {
		http.Error(w, "Missing room parameter", http.StatusBadRequest)
		return
	}

	// Find agent for this room
	r.mu.RLock()
	agent, exists := r.agents[roomID]
	r.mu.RUnlock()

	if !exists {
		http.Error(w, "Room not found (agent not connected)", http.StatusNotFound)
		return
	}

	conn, err := upgrader.Upgrade(w, req, nil)
	if err != nil {
		log.Printf("[Client] Failed to upgrade connection: %v", err)
		return
	}
	defer conn.Close()

	log.Printf("[Client] Client connected to room: %s", roomID)

	// Open a new stream on the agent's yamux session
	stream, err := agent.session.Open()
	if err != nil {
		log.Printf("[Client] Failed to open stream to agent: %v", err)
		return
	}
	defer stream.Close()

	// Bridge WebSocket <-> yamux stream
	errChan := make(chan error, 2)

	// Client -> Agent
	go func() {
		for {
			messageType, data, err := conn.ReadMessage()
			if err != nil {
				errChan <- fmt.Errorf("read from client: %w", err)
				return
			}

			if messageType != websocket.BinaryMessage && messageType != websocket.TextMessage {
				continue
			}

			if _, err := stream.Write(data); err != nil {
				errChan <- fmt.Errorf("write to agent: %w", err)
				return
			}
		}
	}()

	// Agent -> Client
	go func() {
		buf := make([]byte, 32*1024) // 32KB buffer
		for {
			n, err := stream.Read(buf)
			if err != nil {
				if err != io.EOF {
					errChan <- fmt.Errorf("read from agent: %w", err)
				}
				return
			}

			if err := conn.WriteMessage(websocket.BinaryMessage, buf[:n]); err != nil {
				errChan <- fmt.Errorf("write to client: %w", err)
				return
			}
		}
	}()

	// Wait for error or completion
	err = <-errChan
	if err != nil && err != io.EOF {
		log.Printf("[Client] Bridge error: %v", err)
	}

	log.Printf("[Client] Client disconnected from room: %s", roomID)
}

func main() {
	relay := NewRelayServer()

	http.HandleFunc("/agent", relay.handleAgent)
	http.HandleFunc("/client", relay.handleClient)

	// Health check
	http.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		fmt.Fprintf(w, "OK")
	})

	port := 8080
	log.Printf("🔌 Tunnel Relay Server starting on port %d", port)
	log.Printf("   Agent endpoint: ws://localhost:%d/agent?room=<room-id>", port)
	log.Printf("   Client endpoint: ws://localhost:%d/client?room=<room-id>", port)

	if err := http.ListenAndServe(fmt.Sprintf(":%d", port), nil); err != nil {
		log.Fatalf("Server failed: %v", err)
	}
}

// websocketConn wraps gorilla websocket to implement net.Conn interface for yamux
type websocketConn struct {
	conn *websocket.Conn
}

func (w *websocketConn) Read(b []byte) (n int, err error) {
	_, data, err := w.conn.ReadMessage()
	if err != nil {
		return 0, err
	}
	return copy(b, data), nil
}

func (w *websocketConn) Write(b []byte) (n int, err error) {
	err = w.conn.WriteMessage(websocket.BinaryMessage, b)
	if err != nil {
		return 0, err
	}
	return len(b), nil
}

func (w *websocketConn) Close() error {
	return w.conn.Close()
}

func (w *websocketConn) LocalAddr() interface{} {
	return w.conn.LocalAddr()
}

func (w *websocketConn) RemoteAddr() interface{} {
	return w.conn.RemoteAddr()
}

func (w *websocketConn) SetDeadline(t time.Time) error {
	if err := w.conn.SetReadDeadline(t); err != nil {
		return err
	}
	return w.conn.SetWriteDeadline(t)
}

func (w *websocketConn) SetReadDeadline(t time.Time) error {
	return w.conn.SetReadDeadline(t)
}

func (w *websocketConn) SetWriteDeadline(t time.Time) error {
	return w.conn.SetWriteDeadline(t)
}
