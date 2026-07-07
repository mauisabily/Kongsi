import express from "express";
import path from "path";
import http from "http";
import { WebSocketServer, WebSocket } from "ws";
import { createServer as createViteServer } from "vite";
import crypto from "crypto";
import fs from "fs";

const logFile = path.join(process.cwd(), "server.log");
// Clean up existing log file on start
try { fs.writeFileSync(logFile, ""); } catch (e) {}

const originalLog = console.log;
const originalError = console.error;

console.log = (...args) => {
  originalLog(...args);
  try {
    fs.appendFileSync(logFile, `[LOG] ${new Date().toISOString()} - ${args.map(a => typeof a === 'object' ? JSON.stringify(a) : a).join(' ')}\n`);
  } catch (e) {}
};

console.error = (...args) => {
  originalError(...args);
  try {
    fs.appendFileSync(logFile, `[ERR] ${new Date().toISOString()} - ${args.map(a => typeof a === 'object' ? JSON.stringify(a) : a).join(' ')}\n`);
  } catch (e) {}
};

const app = express();
const server = http.createServer(app);
const PORT = 3000;

// Adjectives and Animals for fun random names (Snapdrop style)
const ADJECTIVES = [
  "Golden", "Silver", "Crimson", "Emerald", "Sapphire", "Mystic", "Swift", 
  "Quiet", "Jolly", "Silly", "Clever", "Brave", "Gentle", "Sleepy", "Wild", 
  "Frosty", "Sunny", "Shadow", "Cosmic", "Fluffy", "Dapper", "Eager", "Funky"
];

const ANIMALS = [
  "Dolphin", "Koala", "Kangaroo", "Panda", "Penguin", "Fox", "Otter", "Badger", 
  "Falcon", "Eagle", "Owl", "Squirrel", "Cheetah", "Lemur", "Octopus", 
  "Seahorse", "Turtle", "Hedgehog", "Rabbit", "Sloth", "Beaver", "Panther", "Tiger"
];

function generateRandomName(): string {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const animal = ANIMALS[Math.floor(Math.random() * ANIMALS.length)];
  return `${adj} ${animal}`;
}

// Simple User-Agent parser for OS and Device types
function parseUserAgent(userAgent: string = ""): { os: string; device: "desktop" | "mobile" | "tablet" } {
  const ua = userAgent.toLowerCase();
  let os = "Unknown OS";
  let device: "desktop" | "mobile" | "tablet" = "desktop";

  if (ua.includes("iphone") || ua.includes("ipod")) {
    os = "iOS";
    device = "mobile";
  } else if (ua.includes("ipad")) {
    os = "iOS";
    device = "tablet";
  } else if (ua.includes("android")) {
    os = "Android";
    if (ua.includes("mobile")) {
      device = "mobile";
    } else {
      device = "tablet";
    }
  } else if (ua.includes("windows nt")) {
    os = "Windows";
    device = "desktop";
  } else if (ua.includes("mac os x")) {
    os = "macOS";
    device = "desktop";
  } else if (ua.includes("linux")) {
    os = "Linux";
    device = "desktop";
  }

  return { os, device };
}

// Active connection structure
interface PeerConnection {
  ws: WebSocket;
  id: string;
  name: string;
  os: string;
  device: "desktop" | "mobile" | "tablet";
  ip: string;
  roomId: string;
  isCustomRoom: boolean;
}

// In-memory active connections map
const connections = new Map<string, PeerConnection>();

// Setup WebSocket Server
const wss = new WebSocketServer({ noServer: true });

const pingInterval = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.ping();
    }
  });
}, 20000);

wss.on("close", () => {
  clearInterval(pingInterval);
});

// Handle WebSocket connection upgrade with explicit logging
server.on("upgrade", (request, socket, head) => {
  const urlStr = request.url || "";
  console.log(`[Server] Upgrade request received for URL: ${urlStr}`);
  
  try {
    let pathname = "";
    try {
      if (urlStr.startsWith("/") || !urlStr.includes("://")) {
        const parsedUrl = new URL(urlStr, "http://localhost");
        pathname = parsedUrl.pathname;
      } else {
        const parsedUrl = new URL(urlStr);
        pathname = parsedUrl.pathname;
      }
    } catch (urlErr) {
      pathname = urlStr.split("?")[0].split("#")[0];
      if (pathname.includes("://")) {
        const parts = pathname.split("://")[1];
        const slashIdx = parts.indexOf("/");
        pathname = slashIdx !== -1 ? parts.substring(slashIdx) : "/";
      }
    }

    pathname = pathname.toLowerCase().replace(/\/$/, "");
    if (pathname === "" || pathname === "/") {
      pathname = "";
    }

    if (pathname === "/ws") {
      console.log(`[Server] Routing upgrade request to WebSocketServer for /ws`);
      wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit("connection", ws, request);
      });
    } else {
      console.log(`[Server] Unhandled upgrade request path: ${pathname}. Passing through.`);
    }
  } catch (err) {
    console.error("[Server] Error during upgrade parsing:", err);
    try { socket.destroy(); } catch (e) {}
  }
});

wss.on("connection", (ws: WebSocket, req: http.IncomingMessage) => {
  try {
    const peerId = crypto.randomBytes(8).toString("hex");
    const name = generateRandomName();
    
    // Extract client IP address for local network grouping safely
    let ip = "127.0.0.1";
    const forwarded = req.headers["x-forwarded-for"];
    if (forwarded) {
      const rawIp = Array.isArray(forwarded) ? forwarded[0] : forwarded.split(",")[0];
      if (rawIp && typeof rawIp === "string") {
        ip = rawIp.trim();
      }
    } else if (req.socket.remoteAddress) {
      ip = req.socket.remoteAddress;
    }
    
    // Create a default room ID by hashing the IP
    const defaultRoomId = crypto.createHash("sha256").update(ip).digest("hex").substring(0, 12);
    const { os, device } = parseUserAgent(req.headers["user-agent"] || "");

    const peer: PeerConnection = {
      ws,
      id: peerId,
      name,
      os,
      device,
      ip,
      roomId: defaultRoomId,
      isCustomRoom: false
    };

    connections.set(peerId, peer);
    console.log(`[WS] Connection established for peer: ${peerId} (${name}) from IP: ${ip}`);

    // Send initial welcome details to the client
    sendToPeer(peerId, {
      type: "welcome",
      payload: {
        id: peerId,
        name,
        os,
        device,
        roomId: defaultRoomId,
        isCustomRoom: false
      }
    });

    // Broadcast updated peer list to the room
    broadcastRoomPeers(peer.roomId);

    // Handle messages safely
    ws.on("message", (data: any) => {
      try {
        const rawMessage = data.toString();
        const message = JSON.parse(rawMessage);
        const { type, targetId, payload } = message;

        switch (type) {
          // Change Room (either back to default IP room, or to a custom room code)
          case "join-room": {
            const oldRoomId = peer.roomId;
            const targetRoomId = payload.roomId || defaultRoomId;
            const isCustom = !!payload.roomId;

            peer.roomId = targetRoomId;
            peer.isCustomRoom = isCustom;

            // Notify old room about departure and new room about arrival
            if (oldRoomId !== targetRoomId) {
              broadcastRoomPeers(oldRoomId);
              broadcastRoomPeers(targetRoomId);
            }
            break;
          }

          // WebRTC signaling or text/fallback file messages relayed directly to target peer
          case "signal":
          case "text-message":
          case "file-meta":
          case "file-accepted":
          case "file-rejected":
          case "file-chunk":
          case "file-complete":
          case "transfer-cancel":
          case "peer-ping":
          case "peer-pong": {
            if (targetId && connections.has(targetId)) {
              sendToPeer(targetId, {
                type,
                senderId: peerId,
                payload
              });
            }
            break;
          }

          // Keep-alive/ping-pong
          case "ping": {
            ws.send(JSON.stringify({ type: "pong" }));
            break;
          }

          default:
            console.warn(`[WS] Unknown message type: ${type}`);
        }
      } catch (err) {
        console.error("[WS] Error processing message:", err);
      }
    });

    ws.on("close", (code, reason) => {
      console.log(`[WS] Connection closed for peer: ${peerId}. Code: ${code}, Reason: ${reason}`);
      connections.delete(peerId);
      broadcastRoomPeers(peer.roomId);
    });

    ws.on("error", (err) => {
      console.error(`[WS] Error on peer ${peerId}:`, err);
      connections.delete(peerId);
      broadcastRoomPeers(peer.roomId);
    });
  } catch (err) {
    console.error("[Server] Error handling new WebSocket connection:", err);
    try { ws.close(); } catch (e) {}
  }
});

// Helper: Send JSON message to a peer
function sendToPeer(peerId: string, data: any) {
  const peer = connections.get(peerId);
  if (peer && peer.ws.readyState === WebSocket.OPEN) {
    peer.ws.send(JSON.stringify(data));
  }
}

// Helper: Broadcast peer list in a room
function broadcastRoomPeers(roomId: string) {
  // Find all active connections in this specific room
  const roomPeers = Array.from(connections.values())
    .filter((p) => p.roomId === roomId)
    .map((p) => ({
      id: p.id,
      name: p.name,
      os: p.os,
      device: p.device,
      isCustomRoom: p.isCustomRoom
    }));

  // Distribute this updated list to all peers in the room
  for (const peer of connections.values()) {
    if (peer.roomId === roomId) {
      sendToPeer(peer.id, {
        type: "peer-list",
        payload: {
          peers: roomPeers.filter((p) => p.id !== peer.id),
          roomId,
          isCustomRoom: peer.isCustomRoom
        }
      });
    }
  }
}

// Health Check Endpoint
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", activeConnections: connections.size });
});

// Start full-stack server
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    // Development Mode: Integrate Vite dev server middleware
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Production Mode: Serve static files from compiled dist
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`[Mauidrop Server] Running on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("Failed to start Mauidrop server:", err);
});
