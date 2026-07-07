export interface Peer {
  id: string;
  name: string;
  os: string;
  device: "desktop" | "mobile" | "tablet";
  isCustomRoom: boolean;
}

export interface FileMeta {
  name: string;
  size: number;
  type: string;
}

export interface FileTransferState {
  id: string; // unique transfer session id
  peerId: string;
  peerName: string;
  fileName: string;
  fileSize: number;
  progress: number; // percentage (0 - 100)
  speed: number; // bytes/sec
  eta: number; // seconds remaining
  status: "idle" | "waiting-approval" | "incoming-approval" | "transferring" | "completed" | "failed" | "rejected";
  direction: "send" | "receive";
  bytesTransferred: number;
  error?: string;
}

export interface TextMessage {
  id: string;
  peerId: string;
  peerName: string;
  text: string;
  timestamp: number;
  direction: "send" | "receive";
}
