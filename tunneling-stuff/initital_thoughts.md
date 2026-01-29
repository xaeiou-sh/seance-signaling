 Okay so right now we are working on a service that is set up similarly to a desktop app, and we were working on a system where we using webrtc to do our sychronization over yjs, and it was causing us enough of a headache that we figured it would be a better idea to move over to y-websockets, and proxy the traffic off one device using something like a cloudflare tunnel. This lets us use some websocket specific software and also should hopefully let us solve a lot of the intermittent connection issues we are having with webrtc. Is this a doable thing to implement, the main thing I am working on right now is the tunneling infrastructure and getting that to work successfully. (Ideally this would be a thing we would host ourselves for maximum control, and would be written in a language like go, but rust or typescript would also work.) What would your honest thoughts on implementing this be?

This is a very solid architectural pivot. Moving from WebRTC to Y-Websockets via a reverse tunnel essentially trades the "no-server" ideal of WebRTC for the reliability and predictable state of a client-server model, without requiring your users to mess with their router settings.

In your case, you are implementing what is known as a Reverse Tunnel (Relay). This is not only doable but is the industry standard for "Local-first" apps that need to bypass NAT/Firewalls.
The Architecture: Reverse Tunneling

Instead of other users trying to find a path to the "Host" device (which is hard), the Host device opens an outbound connection to a public Relay Server. That connection stays open, and the Relay Server "pipes" incoming traffic from other clients back down that existing pipe.
Why Go is the right choice for this

Go is the "lingua franca" of tunneling software (see: frp, chisel, ngrok). It has first-class primitives for what you're doing:

    Multiplexing (yamux): You don't want to open 50 TCP connections between your device and the relay. You use a library like Hashicorp’s yamux to multiplex many virtual streams over one single TCP/WebSocket connection.

    Standard Library: Go's net/http and io.Copy make it trivial to "glue" an incoming request on the relay server to a multiplexed stream going to the device.

    Binary Size: You can ship the "Agent" as a small, zero-dependency binary inside your desktop app.

Implementation Blueprint (Go)

If you are writing this from scratch, here is the high-level logic you’ll need to implement:
1. The Relay (Public Server)

    Listen A: For the "Agent" (the device hosting the room) to connect and register.

    Listen B: For the "Clients" to connect to via WebSocket.

    The Glue: When a Client hits Listen B, the Relay creates a new yamux.Stream on the Agent's connection and uses io.Copy to bridge the bytes.

2. The Agent (On the hosting device)

    Local Server: Runs the standard y-websocket server on localhost:1234.

    Tunnel Connection: Connects to the Relay and starts a yamux session.

    The Bridge: For every new stream the Relay sends over, the Agent dials localhost:1234 and pipes the data.

Honest Thoughts & Trade-offs

    The Latency Tax: You are adding a middleman. If the Relay is in Virginia and your users are in Berlin, the "sync" will feel slower than WebRTC. Mitigation: Use a global relay network or host multiple relays.

    The "Host" Dependency: In your current WebRTC setup, if the "creator" leaves, the mesh might stay alive. In the Tunnel/WebSocket model, if the device hosting the tunnel goes offline, the room is dead.

    Scalability: If you have 1,000 active rooms, your Relay server needs to handle 1,000 open TCP connections and the memory overhead of the multiplexer. Go handles this exceptionally well with goroutines.

Next Steps

Since you are currently working on the tunneling infrastructure, I'd suggest looking into the source code of Chisel. It is essentially a production-ready version of what you're describing (TCP/UDP over WebSockets in Go).

Would you like me to draft a minimal Go snippet for the "Relay" and "Agent" logic to help you get the multiplexing started?

Cloudflare Tunnel Explained This video breaks down the concept of tunneling and how a local service can be exposed securely without port forwarding, which is the core of your new infrastructure.
