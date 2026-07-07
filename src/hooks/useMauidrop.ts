import { useEffect, useRef, useState, useCallback } from "react";
import { Peer, FileTransferState, TextMessage } from "../types";

const CHUNK_SIZE = 64 * 1024; // 64 KB chunks
const WEBRTC_TIMEOUT_MS = 3000; // Fall back to WebSocket after 3 seconds if WebRTC is stuck

export function useMauidrop() {
  const [peer, setPeer] = useState<Peer | null>(null);
  const [peers, setPeers] = useState<Peer[]>([]);
  const [roomCode, setRoomCode] = useState<string>("");
  const [isCustomRoom, setIsCustomRoom] = useState<boolean>(false);
  const [connectionStatus, setConnectionStatus] = useState<"connecting" | "connected" | "disconnected">("connecting");
  const [transfers, setTransfers] = useState<FileTransferState[]>([]);
  const [textMessages, setTextMessages] = useState<TextMessage[]>([]);
  const [isForceWebSocket, setIsForceWebSocket] = useState<boolean>(false);

  const socketRef = useRef<WebSocket | null>(null);
  
  // Keep track of ongoing transfers, file chunks, and WebRTC states
  const activeTransfersRef = useRef<Map<string, {
    file?: File;
    receivedChunks: Blob[];
    totalChunks: number;
    bytesTransferred: number;
    startTime: number;
    lastUpdateTime: number;
    lastBytesTransferred: number;
    peerConnection?: RTCPeerConnection;
    dataChannel?: RTCDataChannel;
    webrtcConnected: boolean;
    useWebSocketFallback: boolean;
    timeoutId?: any;
  }>>(new Map());

  // Helper: Send a JSON message through WebSocket
  const sendMessage = useCallback((type: string, targetId?: string, payload?: any) => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ type, targetId, payload }));
    }
  }, []);

  // Set custom room
  const joinRoom = useCallback((customRoomCode?: string) => {
    if (customRoomCode && customRoomCode.trim()) {
      sendMessage("join-room", undefined, { roomId: customRoomCode.trim() });
    } else {
      sendMessage("join-room", undefined, { roomId: null });
    }
  }, [sendMessage]);

  // Clean up WebRTC peer connection
  const cleanupWebRTC = useCallback((transferId: string) => {
    const active = activeTransfersRef.current.get(transferId);
    if (active) {
      if (active.timeoutId) {
        clearTimeout(active.timeoutId);
      }
      if (active.dataChannel) {
        try { active.dataChannel.close(); } catch (e) {}
      }
      if (active.peerConnection) {
        try { active.peerConnection.close(); } catch (e) {}
      }
      active.webrtcConnected = false;
    }
  }, []);

  // Update transfers list state helper
  const updateTransferState = useCallback((id: string, updates: Partial<FileTransferState>) => {
    setTransfers((prev) =>
      prev.map((t) => (t.id === id ? { ...t, ...updates } : t))
    );
  }, []);

  // Cancel an active file transfer
  const cancelTransfer = useCallback((transferId: string, peerId: string, notifyPeer = true) => {
    if (notifyPeer) {
      sendMessage("transfer-cancel", peerId, { transferId });
    }
    
    cleanupWebRTC(transferId);
    activeTransfersRef.current.delete(transferId);

    setTransfers((prev) =>
      prev.map((t) =>
        t.id === transferId
          ? { ...t, status: "failed", error: "Transfer cancelled by user." }
          : t
      )
    );
  }, [sendMessage, cleanupWebRTC]);

  // Convert ArrayBuffer to Base64 (for WebSocket chunk transmission)
  const arrayBufferToBase64 = (buffer: ArrayBuffer): string => {
    let binary = "";
    const bytes = new Uint8Array(buffer);
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
  };

  // Convert Base64 back to ArrayBuffer
  const base64ToArrayBuffer = (base64: string): ArrayBuffer => {
    const binary = window.atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  };

  // Sender Side: Send Next File Chunk (WebRTC or WS fallback)
  const sendNextChunk = useCallback((transferId: string, peerId: string, chunkIndex: number) => {
    const active = activeTransfersRef.current.get(transferId);
    if (!active || !active.file) return;

    const file = active.file;
    const start = chunkIndex * CHUNK_SIZE;
    const end = Math.min(file.size, start + CHUNK_SIZE);
    
    // Check if finished
    if (start >= file.size) {
      // Complete!
      sendMessage("file-complete", peerId, { transferId });
      updateTransferState(transferId, {
        status: "completed",
        progress: 100,
        bytesTransferred: file.size,
        eta: 0
      });
      cleanupWebRTC(transferId);
      activeTransfersRef.current.delete(transferId);
      return;
    }

    const blobSlice = file.slice(start, end);
    const reader = new FileReader();

    reader.onload = async (e) => {
      const buffer = e.target?.result as ArrayBuffer;
      if (!buffer) return;

      const isWS = active.useWebSocketFallback || isForceWebSocket;

      if (!isWS && active.dataChannel && active.dataChannel.readyState === "open") {
        // High Speed WebRTC Data Channel transfer
        try {
          // If buffered amount is too high, wait before sending next chunks
          if (active.dataChannel.bufferedAmount > 16 * 1024 * 1024) { // 16MB threshold
            setTimeout(() => sendNextChunk(transferId, peerId, chunkIndex), 50);
            return;
          }
          active.dataChannel.send(buffer);
          
          // Progress & speed calculations
          const bytesSent = buffer.byteLength;
          active.bytesTransferred += bytesSent;
          
          const now = Date.now();
          const elapsed = (now - active.startTime) / 1000;
          const currentSpeed = elapsed > 0 ? active.bytesTransferred / elapsed : 0;
          const remainingBytes = file.size - active.bytesTransferred;
          const eta = currentSpeed > 0 ? remainingBytes / currentSpeed : 0;

          // Throttle state updates for better performance
          if (now - active.lastUpdateTime > 300 || active.bytesTransferred === file.size) {
            updateTransferState(transferId, {
              progress: Math.floor((active.bytesTransferred / file.size) * 100),
              bytesTransferred: active.bytesTransferred,
              speed: currentSpeed,
              eta: Math.round(eta)
            });
            active.lastUpdateTime = now;
          }

          // Trigger next chunk immediately (since WebRTC is fast and local)
          sendNextChunk(transferId, peerId, chunkIndex + 1);
        } catch (err) {
          console.warn("[WebRTC] DataChannel send failed, falling back to WebSocket:", err);
          active.useWebSocketFallback = true;
          sendNextChunk(transferId, peerId, chunkIndex);
        }
      } else {
        // Fallback: Send chunk via WebSockets (safe, reliable for iframes)
        const base64Chunk = arrayBufferToBase64(buffer);
        sendMessage("file-chunk", peerId, {
          transferId,
          chunkIndex,
          chunkData: base64Chunk,
          chunkSize: buffer.byteLength
        });

        const bytesSent = buffer.byteLength;
        active.bytesTransferred += bytesSent;
        
        const now = Date.now();
        const elapsed = (now - active.startTime) / 1000;
        const currentSpeed = elapsed > 0 ? active.bytesTransferred / elapsed : 0;
        const remainingBytes = file.size - active.bytesTransferred;
        const eta = currentSpeed > 0 ? remainingBytes / currentSpeed : 0;

        if (now - active.lastUpdateTime > 300 || active.bytesTransferred === file.size) {
          updateTransferState(transferId, {
            progress: Math.floor((active.bytesTransferred / file.size) * 100),
            bytesTransferred: active.bytesTransferred,
            speed: currentSpeed,
            eta: Math.round(eta)
          });
          active.lastUpdateTime = now;
        }

        // WebSockets can suffer from congestion, so we let the receiver acknowledge 
        // the receipt or send chunks at a quick paced rate. 
        // Since we want simple, direct, lightweight implementation:
        // We trigger next chunk after a tiny micro-delay to let the browser process network packets.
        setTimeout(() => {
          sendNextChunk(transferId, peerId, chunkIndex + 1);
        }, 1);
      }
    };

    reader.readAsArrayBuffer(blobSlice);
  }, [sendMessage, updateTransferState, cleanupWebRTC, isForceWebSocket]);

  // Initiate a WebRTC connection as the SENDER
  const initWebRTCSender = useCallback((transferId: string, peerId: string) => {
    const active = activeTransfersRef.current.get(transferId);
    if (!active) return;

    if (isForceWebSocket) {
      // Force WebSocket relay immediately
      active.useWebSocketFallback = true;
      sendNextChunk(transferId, peerId, 0);
      return;
    }

    try {
      const pc = new RTCPeerConnection({
        iceServers: [
          { urls: "stun:stun.l.google.com:19302" },
          { urls: "stun:stun1.l.google.com:19302" }
        ]
      });

      const dc = pc.createDataChannel("fileTransfer", { ordered: true });
      active.peerConnection = pc;
      active.dataChannel = dc;

      // Handle ICE Candidates
      pc.onicecandidate = (e) => {
        if (e.candidate) {
          sendMessage("signal", peerId, { transferId, candidate: e.candidate });
        }
      };

      dc.onopen = () => {
        if (active.timeoutId) clearTimeout(active.timeoutId);
        active.webrtcConnected = true;
        active.useWebSocketFallback = false;
        active.startTime = Date.now();
        sendNextChunk(transferId, peerId, 0);
      };

      dc.onclose = () => {
        active.webrtcConnected = false;
      };

      dc.onerror = (e) => {
        console.error("[WebRTC] DataChannel error:", e);
      };

      // Set fallback timeout: if WebRTC fails to connect in 3 seconds, use WebSocket chunks
      const timeoutId = setTimeout(() => {
        console.log("[WebRTC] Direct P2P connection timeout. Falling back to WebSocket relay.");
        active.useWebSocketFallback = true;
        active.startTime = Date.now();
        sendNextChunk(transferId, peerId, 0);
      }, WEBRTC_TIMEOUT_MS);

      active.timeoutId = timeoutId;

      // Create Offer SDP
      pc.createOffer().then((offer) => {
        return pc.setLocalDescription(offer);
      }).then(() => {
        sendMessage("signal", peerId, { transferId, sdp: pc.localDescription });
      }).catch((err) => {
        console.warn("[WebRTC] Offer generation failed, fallback immediately:", err);
        active.useWebSocketFallback = true;
        sendNextChunk(transferId, peerId, 0);
      });

    } catch (err) {
      console.warn("[WebRTC] Initialization failed, using WebSocket fallback:", err);
      active.useWebSocketFallback = true;
      sendNextChunk(transferId, peerId, 0);
    }
  }, [sendMessage, sendNextChunk, isForceWebSocket]);

  // Setup WebRTC as RECEIVER
  const initWebRTCReceiver = useCallback((transferId: string, peerId: string, offerSDP: RTCSessionDescriptionInit) => {
    const active = activeTransfersRef.current.get(transferId);
    if (!active) return;

    try {
      const pc = new RTCPeerConnection({
        iceServers: [
          { urls: "stun:stun.l.google.com:19302" },
          { urls: "stun:stun1.l.google.com:19302" }
        ]
      });

      active.peerConnection = pc;

      pc.onicecandidate = (e) => {
        if (e.candidate) {
          sendMessage("signal", peerId, { transferId, candidate: e.candidate });
        }
      };

      // Listen for the incoming Data Channel
      pc.ondatachannel = (e) => {
        const dc = e.channel;
        active.dataChannel = dc;
        active.webrtcConnected = true;
        active.useWebSocketFallback = false;
        active.startTime = Date.now();

        dc.onmessage = (event) => {
          const buffer = event.data as ArrayBuffer;
          handleIncomingChunk(transferId, buffer);
        };

        dc.onclose = () => {
          active.webrtcConnected = false;
        };
      };

      // Accept Offer
      pc.setRemoteDescription(new RTCSessionDescription(offerSDP))
        .then(() => pc.createAnswer())
        .then((answer) => pc.setLocalDescription(answer))
        .then(() => {
          sendMessage("signal", peerId, { transferId, sdp: pc.localDescription });
        })
        .catch((err) => {
          console.error("[WebRTC] Failed to handle incoming WebRTC offer:", err);
        });

    } catch (err) {
      console.error("[WebRTC] Receiver setup failed:", err);
    }
  }, [sendMessage]);

  // Handle incoming chunk (shared between WebRTC and WebSocket)
  const handleIncomingChunk = (transferId: string, arrayBuffer: ArrayBuffer) => {
    const active = activeTransfersRef.current.get(transferId);
    if (!active) return;

    active.receivedChunks.push(new Blob([arrayBuffer]));
    active.bytesTransferred += arrayBuffer.byteLength;

    const now = Date.now();
    const elapsed = (now - active.startTime) / 1000;
    const currentSpeed = elapsed > 0 ? active.bytesTransferred / elapsed : 0;
    const totalSize = active.receivedChunks.reduce((acc, b) => acc + b.size, 0); // or file state size
    
    // Estimate ETA based on remaining bytes
    // For receivers, we know file size from state
    setTransfers((prev) => {
      const current = prev.find((t) => t.id === transferId);
      if (!current) return prev;
      
      const fileLength = current.fileSize;
      const progress = Math.floor((active.bytesTransferred / fileLength) * 100);
      const remainingBytes = fileLength - active.bytesTransferred;
      const eta = currentSpeed > 0 ? remainingBytes / currentSpeed : 0;

      // Throttle updates
      if (now - active.lastUpdateTime > 300 || active.bytesTransferred >= fileLength) {
        active.lastUpdateTime = now;
        return prev.map((t) =>
          t.id === transferId
            ? {
                ...t,
                progress,
                bytesTransferred: active.bytesTransferred,
                speed: currentSpeed,
                eta: Math.round(eta)
              }
            : t
        );
      }
      return prev;
    });
  };

  // Sender Side: Select File and Initiate Request
  const sendFile = useCallback((peerId: string, peerName: string, file: File) => {
    const transferId = Math.random().toString(36).substring(2, 10);
    
    // Register active transfer
    activeTransfersRef.current.set(transferId, {
      file,
      receivedChunks: [],
      totalChunks: Math.ceil(file.size / CHUNK_SIZE),
      bytesTransferred: 0,
      startTime: Date.now(),
      lastUpdateTime: Date.now(),
      lastBytesTransferred: 0,
      webrtcConnected: false,
      useWebSocketFallback: false
    });

    const newTransfer: FileTransferState = {
      id: transferId,
      peerId,
      peerName,
      fileName: file.name,
      fileSize: file.size,
      progress: 0,
      speed: 0,
      eta: 0,
      status: "waiting-approval",
      direction: "send",
      bytesTransferred: 0
    };

    setTransfers((prev) => [newTransfer, ...prev]);

    // Send transfer request to receiver
    sendMessage("file-meta", peerId, {
      transferId,
      name: file.name,
      size: file.size,
      type: file.type
    });
  }, [sendMessage]);

  // Receiver Side: Accept Transfer
  const acceptTransfer = useCallback((transferId: string, peerId: string) => {
    sendMessage("file-accepted", peerId, { transferId });
    updateTransferState(transferId, { status: "transferring" });
    
    const active = activeTransfersRef.current.get(transferId);
    if (active) {
      active.startTime = Date.now();
    }
  }, [sendMessage, updateTransferState]);

  // Receiver Side: Reject Transfer
  const rejectTransfer = useCallback((transferId: string, peerId: string) => {
    sendMessage("file-rejected", peerId, { transferId });
    
    activeTransfersRef.current.delete(transferId);
    setTransfers((prev) => prev.filter((t) => t.id !== transferId));
  }, [sendMessage]);

  // Text message sharing (Snapdrop direct message feature)
  const sendTextMessage = useCallback((peerId: string, peerName: string, text: string) => {
    if (!text.trim()) return;

    const msgId = Math.random().toString(36).substring(2, 10);
    const newMsg: TextMessage = {
      id: msgId,
      peerId,
      peerName,
      text: text.trim(),
      timestamp: Date.now(),
      direction: "send"
    };

    setTextMessages((prev) => [...prev, newMsg]);
    sendMessage("text-message", peerId, { id: msgId, text: text.trim() });
  }, [sendMessage]);

  // Refs and synchronization to prevent infinite WebSocket reconnection triggers
  const peersRef = useRef<Peer[]>([]);
  useEffect(() => {
    peersRef.current = peers;
  }, [peers]);

  const initWebRTCReceiverRef = useRef(initWebRTCReceiver);
  const initWebRTCSenderRef = useRef(initWebRTCSender);
  const cleanupWebRTCRef = useRef(cleanupWebRTC);

  useEffect(() => {
    initWebRTCReceiverRef.current = initWebRTCReceiver;
    initWebRTCSenderRef.current = initWebRTCSender;
    cleanupWebRTCRef.current = cleanupWebRTC;
  }, [initWebRTCReceiver, initWebRTCSender, cleanupWebRTC]);

  // Re-establish WebSocket connection on disconnect
  useEffect(() => {
    let active = true;
    let reconnectTimeout: any;

    const connect = () => {
      setConnectionStatus("connecting");
      
      // Determine protocol: ws/wss based on the origin protocol
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const host = window.location.host;
      const wsUrl = `${protocol}//${host}/ws`;

      console.log(`[Mauidrop] Connecting to WebSocket server: ${wsUrl}`);
      const socket = new WebSocket(wsUrl);
      socketRef.current = socket;

      socket.onopen = () => {
        if (!active) return;
        setConnectionStatus("connected");
        console.log("[Mauidrop] Connected to signaling server");
      };

      socket.onmessage = (event) => {
        if (!active) return;

        try {
          const message = JSON.parse(event.data);
          const { type, senderId, payload } = message;

          switch (type) {
            case "welcome": {
              setPeer({
                id: payload.id,
                name: payload.name,
                os: payload.os,
                device: payload.device,
                isCustomRoom: payload.isCustomRoom
              });
              setRoomCode(payload.roomId);
              setIsCustomRoom(payload.isCustomRoom);
              break;
            }

            case "peer-list": {
              setPeers(payload.peers);
              setRoomCode(payload.roomId);
              setIsCustomRoom(payload.isCustomRoom);
              break;
            }

            // Receive signal SDP / ICE
            case "signal": {
              const activeTx = activeTransfersRef.current.get(payload.transferId);
              if (activeTx) {
                if (payload.sdp) {
                  const sdp = payload.sdp;
                  if (sdp.type === "offer") {
                    initWebRTCReceiverRef.current(payload.transferId, senderId, sdp);
                  } else if (sdp.type === "answer" && activeTx.peerConnection) {
                    activeTx.peerConnection.setRemoteDescription(new RTCSessionDescription(sdp))
                      .catch(err => console.warn("[WebRTC] Failed to set remote answer:", err));
                  }
                } else if (payload.candidate && activeTx.peerConnection) {
                  activeTx.peerConnection.addIceCandidate(new RTCIceCandidate(payload.candidate))
                    .catch(() => {});
                }
              }
              break;
            }

            // Text message sharing
            case "text-message": {
              const fromPeer = peersRef.current.find((p) => p.id === senderId) || { name: "Someone" };
              const newMsg: TextMessage = {
                id: payload.id || Math.random().toString(),
                peerId: senderId,
                peerName: fromPeer.name,
                text: payload.text,
                timestamp: Date.now(),
                direction: "receive"
              };
              setTextMessages((prev) => [...prev, newMsg]);
              break;
            }

            // File Metadata Request
            case "file-meta": {
              const fromPeer = peersRef.current.find((p) => p.id === senderId) || { name: "Someone" };
              
              // Register receiving state
              activeTransfersRef.current.set(payload.transferId, {
                receivedChunks: [],
                totalChunks: 0, // calculated from metadata packets
                bytesTransferred: 0,
                startTime: Date.now(),
                lastUpdateTime: Date.now(),
                lastBytesTransferred: 0,
                webrtcConnected: false,
                useWebSocketFallback: false
              });

              const newTransfer: FileTransferState = {
                id: payload.transferId,
                peerId: senderId,
                peerName: fromPeer.name,
                fileName: payload.name,
                fileSize: payload.size,
                progress: 0,
                speed: 0,
                eta: 0,
                status: "incoming-approval",
                direction: "receive",
                bytesTransferred: 0
              };

              setTransfers((prev) => [newTransfer, ...prev]);
              break;
            }

            // File Accepted
            case "file-accepted": {
              const transferId = payload.transferId;
              updateTransferState(transferId, { status: "transferring" });
              initWebRTCSenderRef.current(transferId, senderId);
              break;
            }

            // File Rejected
            case "file-rejected": {
              const transferId = payload.transferId;
              updateTransferState(transferId, { status: "rejected", error: "Transfer was rejected." });
              cleanupWebRTCRef.current(transferId);
              activeTransfersRef.current.delete(transferId);
              break;
            }

            // File Chunk via WebSocket fallback
            case "file-chunk": {
              const { transferId, chunkData } = payload;
              const arrayBuffer = base64ToArrayBuffer(chunkData);
              handleIncomingChunk(transferId, arrayBuffer);
              break;
            }

            // File Complete
            case "file-complete": {
              const transferId = payload.transferId;
              const activeTx = activeTransfersRef.current.get(transferId);
              if (activeTx) {
                // Compile received blobs into single blob and trigger automatic download
                const fileBlob = new Blob(activeTx.receivedChunks);
                const downloadUrl = URL.createObjectURL(fileBlob);
                
                // Get filename from transfer state
                setTransfers((prev) => {
                  const current = prev.find((t) => t.id === transferId);
                  if (current) {
                    const a = document.createElement("a");
                    a.href = downloadUrl;
                    a.download = current.fileName;
                    a.click();
                  }
                  
                  return prev.map((t) =>
                    t.id === transferId
                      ? {
                          ...t,
                          status: "completed",
                          progress: 100,
                          bytesTransferred: current ? current.fileSize : activeTx.bytesTransferred
                        }
                      : t
                  );
                });

                // Clear memory
                cleanupWebRTCRef.current(transferId);
                activeTransfersRef.current.delete(transferId);
              }
              break;
            }

            // Transfer Cancelled by peer
            case "transfer-cancel": {
              const transferId = payload.transferId;
              cleanupWebRTCRef.current(transferId);
              activeTransfersRef.current.delete(transferId);

              setTransfers((prev) =>
                prev.map((t) =>
                  t.id === transferId
                    ? { ...t, status: "failed", error: "Transfer cancelled by peer." }
                    : t
                )
              );
              break;
            }

            default:
              break;
          }
        } catch (err) {
          console.error("[WS] Error parsing incoming payload:", err);
        }
      };

      socket.onclose = () => {
        if (!active) return;
        setConnectionStatus("disconnected");
        setPeer(null);
        setPeers([]);
        // Reconnect after 3 seconds
        reconnectTimeout = setTimeout(connect, 3000);
      };

      socket.onerror = (err) => {
        console.error("[WS] Error in socket connection:", err);
        socket.close();
      };
    };

    connect();

    return () => {
      active = false;
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      if (socketRef.current) socketRef.current.close();
      
      // Clean up all active peer connections
      for (const id of activeTransfersRef.current.keys()) {
        cleanupWebRTCRef.current(id);
      }
    };
  }, []);

  // Keep-alive interval to prevent server termination of idle sockets
  useEffect(() => {
    const interval = setInterval(() => {
      if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
        socketRef.current.send(JSON.stringify({ type: "ping" }));
      }
    }, 20000); // 20s heartbeat

    return () => clearInterval(interval);
  }, []);

  return {
    peer,
    peers,
    roomCode,
    isCustomRoom,
    connectionStatus,
    transfers,
    textMessages,
    isForceWebSocket,
    setIsForceWebSocket,
    joinRoom,
    sendFile,
    acceptTransfer,
    rejectTransfer,
    cancelTransfer,
    sendTextMessage
  };
}
