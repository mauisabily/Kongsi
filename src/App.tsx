import React, { useState, useEffect, useRef } from "react";
import { useMauidrop } from "./hooks/useMauidrop";
import { Peer, FileTransferState, TextMessage } from "./types";
import { 
  Laptop, 
  Smartphone, 
  Tablet, 
  Wifi, 
  WifiOff, 
  Share2, 
  Download, 
  Upload, 
  X, 
  Send, 
  MessageSquare, 
  Check, 
  AlertCircle, 
  Settings, 
  Activity, 
  Info, 
  HelpCircle, 
  RefreshCw, 
  Copy, 
  Plus, 
  FileText, 
  CheckCircle2, 
  Sparkles,
  Link2
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

const renderSignalIndicator = (latency: number | undefined) => {
  if (latency === undefined) {
    return (
      <div className="flex gap-0.5 items-end justify-center h-2.5 px-1 py-0.5" title="Measuring latency...">
        <div className="w-0.5 h-1 bg-slate-300 animate-pulse" />
        <div className="w-0.5 h-1.5 bg-slate-300 animate-pulse delay-75" />
        <div className="w-0.5 h-2 bg-slate-300 animate-pulse delay-150" />
        <div className="w-0.5 h-2.5 bg-slate-300 animate-pulse delay-300" />
      </div>
    );
  }

  let colorClass = "bg-emerald-500";
  let bars = 4;
  let text = `${latency}ms`;

  if (latency < 80) {
    colorClass = "bg-emerald-500";
    bars = 4;
  } else if (latency < 180) {
    colorClass = "bg-emerald-400";
    bars = 3;
  } else if (latency < 300) {
    colorClass = "bg-amber-400";
    bars = 2;
  } else {
    colorClass = "bg-rose-500";
    bars = 1;
  }

  return (
    <div className="flex flex-col items-center gap-0.5" title={`Latency: ${latency}ms`}>
      <div className="flex gap-0.5 items-end h-2.5">
        <div className={`w-0.5 h-1 rounded-xs ${bars >= 1 ? colorClass : "bg-slate-200"}`} />
        <div className={`w-0.5 h-1.5 rounded-xs ${bars >= 2 ? colorClass : "bg-slate-200"}`} />
        <div className={`w-0.5 h-2 rounded-xs ${bars >= 3 ? colorClass : "bg-slate-200"}`} />
        <div className={`w-0.5 h-2.5 rounded-xs ${bars >= 4 ? colorClass : "bg-slate-200"}`} />
      </div>
      <span className="text-[7px] font-mono font-bold text-slate-400 leading-none">
        {text}
      </span>
    </div>
  );
};

export default function App() {
  const {
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
    sendTextMessage,
    peerLatencies,
    useProductionSignaling,
    toggleProductionSignaling
  } = useMauidrop();

  // App UI State
  const [activeTab, setActiveTab] = useState<"radar" | "transfers" | "messages">("radar");
  const [selectedPeer, setSelectedPeer] = useState<Peer | null>(null);
  const [peerActionMenu, setPeerActionMenu] = useState<Peer | null>(null);
  const [isRoomModalOpen, setIsRoomModalOpen] = useState(false);
  const [customRoomInput, setCustomRoomInput] = useState("");
  const [isCopied, setIsCopied] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [activeChatPeer, setActiveChatPeer] = useState<Peer | null>(null);
  const [chatInput, setChatInput] = useState("");

  const fileInputRef = useRef<HTMLInputElement>(null);
  const chatBottomRef = useRef<HTMLDivElement>(null);

  // Read ?room= param on page load
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const roomParam = params.get("room");
    if (roomParam && connectionStatus === "connected") {
      joinRoom(roomParam);
    }
  }, [connectionStatus, joinRoom]);

  // Scroll to bottom of chat when new messages arrive
  useEffect(() => {
    if (chatBottomRef.current) {
      chatBottomRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [textMessages, activeChatPeer]);

  // Format File Size
  const formatBytes = (bytes: number, decimals = 2) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
  };

  // Format Speed
  const formatSpeed = (bytesPerSec: number) => {
    if (bytesPerSec === 0) return "0 B/s";
    const k = 1024;
    const sizes = ["B/s", "KB/s", "MB/s", "GB/s"];
    const i = Math.floor(Math.log(bytesPerSec) / Math.log(k));
    return parseFloat((bytesPerSec / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  };

  // Get OS & Device Icons
  const getOSIcon = (os: string) => {
    const name = os.toLowerCase();
    if (name.includes("windows")) return "🪟 Windows";
    if (name.includes("ios") || name.includes("mac")) return "🍎 Apple";
    if (name.includes("android")) return "🤖 Android";
    if (name.includes("linux")) return "🐧 Linux";
    return "🌐 Web";
  };

  const getDeviceIcon = (device: "desktop" | "mobile" | "tablet", size = 24, className = "text-slate-700") => {
    switch (device) {
      case "mobile":
        return <Smartphone size={size} className={className} id={`icon-mobile-${size}`} />;
      case "tablet":
        return <Tablet size={size} className={className} id={`icon-tablet-${size}`} />;
      default:
        return <Laptop size={size} className={className} id={`icon-desktop-${size}`} />;
    }
  };

  // Handle peer circle positions
  const getPeerPosition = (index: number, total: number) => {
    if (total === 0) return { x: 0, y: 0 };
    // Space out peers evenly starting from top
    const angle = (index * 2 * Math.PI) / total - Math.PI / 2;
    // Responsive circle radius based on screen size
    const radius = window.innerWidth < 640 ? 115 : 150;
    return {
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius,
    };
  };

  // Drag & Drop handlers
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const droppedFile = e.dataTransfer.files[0];
      // If there's only one peer online, target them automatically!
      if (peers.length === 1) {
        sendFile(peers[0].id, peers[0].name, droppedFile);
      } else if (peers.length > 1) {
        // Show selection list
        setSelectedPeerForDrop(droppedFile);
      }
    }
  };

  const [selectedPeerForDrop, setSelectedPeerForDrop] = useState<File | null>(null);

  // Trigger file selection input
  const handlePeerClick = (clickedPeer: Peer) => {
    setSelectedPeer(clickedPeer);
    setPeerActionMenu(clickedPeer);
  };

  const triggerFileInput = (peerId: string) => {
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
    setPeerActionMenu(null);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0] && selectedPeer) {
      sendFile(selectedPeer.id, selectedPeer.name, e.target.files[0]);
    }
  };

  // Chat panel trigger
  const triggerChat = (peer: Peer) => {
    setActiveChatPeer(peer);
    setPeerActionMenu(null);
    setActiveTab("messages");
  };

  const handleSendChat = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || !activeChatPeer) return;
    sendTextMessage(activeChatPeer.id, activeChatPeer.name, chatInput);
    setChatInput("");
  };

  // Copy room link
  const copyRoomLink = () => {
    const origin = useProductionSignaling || window.location.origin.includes("localhost") || window.location.origin.includes("run.app")
      ? "https://kongsi.kpst.my"
      : window.location.origin;
    const url = `${origin}${window.location.pathname}?room=${roomCode}`;
    navigator.clipboard.writeText(url).then(() => {
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    });
  };

  // Filter transfers for counting badges
  const activeTransfersCount = transfers.filter(
    (t) => t.status === "transferring" || t.status === "waiting-approval" || t.status === "incoming-approval"
  ).length;

  // Find incoming transfer requiring approval
  const incomingApproval = transfers.find((t) => t.status === "incoming-approval");

  return (
    <div 
      className="min-h-screen bg-slate-50 text-slate-800 font-sans flex flex-col relative overflow-x-hidden selection:bg-blue-500/10 select-none"
      onDragEnter={handleDrag}
      onDragOver={handleDrag}
      onDragLeave={handleDrag}
      onDrop={handleDrop}
      id="mauidrop-root"
    >
      {/* Background Geometric Grid Grid Accent */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#e2e8f0_1px,transparent_1px),linear-gradient(to_bottom,#e2e8f0_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] opacity-30 pointer-events-none" />

      {/* HEADER SECTION */}
      <header className="border-b border-slate-200 bg-white/80 backdrop-blur-md sticky top-0 z-40 px-4 py-3" id="mauidrop-header">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-blue-600 p-2 rounded-xl shadow-xs" id="mauidrop-logo-container">
              <Sparkles className="text-white animate-pulse" size={20} id="mauidrop-logo" />
            </div>
            <div>
              <h1 className="text-xl font-bold font-display tracking-tight text-slate-900">
                mauidrop
              </h1>
              <span className="text-[10px] text-blue-600 font-mono tracking-widest uppercase font-semibold">
                Lightweight Peer Share
              </span>
            </div>
          </div>

          {/* Connection Status & Room ID Badge */}
          <div className="flex items-center gap-2 sm:gap-3">
            <button
              onClick={() => setIsRoomModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 hover:border-slate-300 transition-all text-xs cursor-pointer font-medium text-slate-700 shadow-xs"
              id="room-selector-button"
            >
              <Wifi size={14} className="text-blue-600" id="icon-wifi" />
              <span>Room:</span>
              <span className="text-blue-600 font-bold font-mono">
                {isCustomRoom ? roomCode : "Local (Wi-Fi)"}
              </span>
            </button>

            <button
              onClick={() => setIsHelpOpen(true)}
              className="p-2 rounded-lg border border-slate-200 bg-white text-slate-500 hover:text-slate-800 hover:bg-slate-50 transition-colors shadow-xs"
              title="How to Use"
              id="help-button"
            >
              <HelpCircle size={16} id="icon-help" />
            </button>
          </div>
        </div>
      </header>

      {/* CORE VIEW LAYOUT */}
      <main className="flex-1 max-w-6xl w-full mx-auto p-4 flex flex-col md:grid md:grid-cols-3 gap-6 relative z-10">
        
        {/* LEFT COLUMN: ACTIVE USER CONTROLS & SETTINGS (DESKTOP) OR TOP WIDGETS */}
        <div className="md:col-span-1 flex flex-col gap-4">
          
          {/* Identity Card */}
          <div className="p-4 rounded-2xl border border-slate-200 bg-white shadow-sm flex flex-col gap-3" id="identity-card">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Your Identity</span>
              <div className="flex items-center gap-1.5 text-xs text-emerald-600">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                <span className="font-semibold">Online</span>
              </div>
            </div>

            {peer ? (
              <div className="flex items-center gap-3 bg-slate-50 p-3 rounded-xl border border-slate-100">
                <div className="p-2.5 rounded-lg bg-blue-50 border border-blue-100">
                  {getDeviceIcon(peer.device, 26)}
                </div>
                <div className="overflow-hidden">
                  <p className="font-bold text-slate-900 font-display truncate">{peer.name}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{getOSIcon(peer.os)}</p>
                </div>
              </div>
            ) : (
              <div className="animate-pulse flex gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100">
                <div className="w-12 h-12 bg-slate-200 rounded-lg" />
                <div className="flex-1 space-y-2 py-1">
                  <div className="h-4 bg-slate-200 rounded w-3/4" />
                  <div className="h-3 bg-slate-200 rounded w-1/2" />
                </div>
              </div>
            )}

            <div className="text-xs text-slate-500 space-y-1">
              <p>Devices around you on the same Wi-Fi network will automatically appear in the radar.</p>
            </div>
          </div>

          {/* QUICK CHANNELS TAB TRIGGER FOR MOBILE */}
          <div className="flex md:hidden border border-slate-200 bg-white p-1 rounded-xl shadow-xs" id="mobile-tab-bar">
            <button
              onClick={() => setActiveTab("radar")}
              className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-colors flex justify-center items-center gap-2 ${
                activeTab === "radar" 
                  ? "bg-slate-100 border border-slate-200 text-blue-600" 
                  : "text-slate-500 hover:text-slate-800"
              }`}
            >
              <Activity size={14} />
              Radar
            </button>
            <button
              onClick={() => setActiveTab("transfers")}
              className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-colors flex justify-center items-center gap-2 relative ${
                activeTab === "transfers" 
                  ? "bg-slate-100 border border-slate-200 text-blue-600" 
                  : "text-slate-500 hover:text-slate-800"
              }`}
            >
              <Share2 size={14} />
              Transfer
              {activeTransfersCount > 0 && (
                <span className="absolute top-1.5 right-1.5 flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-500 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-600"></span>
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab("messages")}
              className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-colors flex justify-center items-center gap-2 relative ${
                activeTab === "messages" 
                  ? "bg-slate-100 border border-slate-200 text-blue-600" 
                  : "text-slate-500 hover:text-slate-800"
              }`}
            >
              <MessageSquare size={14} />
              Chat
              {textMessages.length > 0 && (
                <span className="absolute top-1 right-1.5 px-1.5 py-0.5 text-[8px] bg-blue-600 text-white rounded-full font-bold">
                  {textMessages.length}
                </span>
              )}
            </button>
          </div>

          {/* SETTINGS CARD */}
          <div className="p-4 rounded-2xl border border-slate-200 bg-white shadow-sm flex flex-col gap-4" id="settings-card">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-500 uppercase tracking-wider">
              <Settings size={14} className="text-blue-600" />
              <span>Network Settings</span>
            </div>

            <div className="space-y-3">
              <label className="flex items-start gap-3 cursor-pointer select-none group" id="ws-relay-toggle-label">
                <input 
                  type="checkbox"
                  checked={isForceWebSocket}
                  onChange={(e) => setIsForceWebSocket(e.target.checked)}
                  className="mt-1 rounded border-slate-300 bg-slate-50 text-blue-600 focus:ring-blue-500/20 w-4 h-4 cursor-pointer"
                  id="ws-relay-toggle"
                />
                <div className="text-xs">
                  <span className="font-semibold text-slate-700 group-hover:text-blue-600 transition-colors">Force Cloud Relay (WebSocket)</span>
                  <p className="text-slate-500 mt-0.5 leading-relaxed">
                    Enable if transfers are slow or blocked. Files will be sent through a secure cloud server (useful if WebRTC local connection has issues).
                  </p>
                </div>
              </label>

              <label className="flex items-start gap-3 cursor-pointer select-none group border-t border-slate-100 pt-3" id="prod-relay-toggle-label">
                <input 
                  type="checkbox"
                  checked={useProductionSignaling}
                  onChange={toggleProductionSignaling}
                  className="mt-1 rounded border-slate-300 bg-slate-50 text-blue-600 focus:ring-blue-500/20 w-4 h-4 cursor-pointer"
                  id="prod-relay-toggle"
                />
                <div className="text-xs">
                  <span className="font-semibold text-slate-700 group-hover:text-blue-600 transition-colors">Connect to Production Server</span>
                  <p className="text-slate-500 mt-0.5 leading-relaxed">
                    Bridges your local client to the production server <strong>kongsi.kpst.my</strong>. Turn this on when testing from a development container or when you are alone on your network.
                  </p>
                </div>
              </label>

              <div className="p-3 rounded-xl bg-blue-50/50 border border-blue-100/60 text-xs text-blue-800 leading-relaxed flex items-start gap-2">
                <Info size={14} className="shrink-0 mt-0.5 text-blue-600" />
                <p>
                  <strong>Speed Tip:</strong> Use the same 5GHz Wi-Fi network on both devices to get the best direct peer-to-peer transfer performance!
                </p>
              </div>
            </div>
          </div>

          {/* ROOM DETAILS IN COLUMN FOR QUICK COPY */}
          <div className="p-4 rounded-2xl border border-slate-200 bg-white shadow-sm flex flex-col gap-3" id="room-card">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Share Link</span>
            <p className="text-xs text-slate-600 leading-normal">
              Invite other devices outside your Wi-Fi network to join your custom room with this link:
            </p>
            <div className="flex items-center gap-2 mt-1">
              <div className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-600 font-mono truncate select-all">
                {`${(useProductionSignaling || window.location.origin.includes("localhost") || window.location.origin.includes("run.app")) ? "https://kongsi.kpst.my" : window.location.origin}${window.location.pathname}?room=${roomCode}`}
              </div>
              <button
                onClick={copyRoomLink}
                className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:text-blue-600 hover:bg-slate-50 transition-colors cursor-pointer shadow-xs"
                title="Copy Link"
                id="copy-invite-link"
              >
                {isCopied ? <Check size={14} className="text-emerald-600" /> : <Link2 size={14} />}
              </button>
            </div>
          </div>

        </div>

        {/* MIDDLE COLUMN: MAIN INTERACTIVE AREA (RADAR MAP OR CHAT) */}
        <div className="md:col-span-2 flex flex-col gap-4">
          
          {/* DESKTOP TABS BAR */}
          <div className="hidden md:flex border border-slate-200 bg-white p-1 rounded-xl shadow-xs" id="desktop-tab-bar">
            <button
              onClick={() => setActiveTab("radar")}
              className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-colors flex justify-center items-center gap-2 ${
                activeTab === "radar" 
                  ? "bg-slate-100 border border-slate-200 text-blue-600" 
                  : "text-slate-500 hover:text-slate-800"
              }`}
            >
              <Activity size={16} />
              Sharing Radar
            </button>
            <button
              onClick={() => setActiveTab("transfers")}
              className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-colors flex justify-center items-center gap-2 relative ${
                activeTab === "transfers" 
                  ? "bg-slate-100 border border-slate-200 text-blue-600" 
                  : "text-slate-500 hover:text-slate-800"
              }`}
            >
              <Share2 size={16} />
              Transfer List ({transfers.length})
              {activeTransfersCount > 0 && (
                <span className="absolute top-2 right-4 flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-500 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-600"></span>
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab("messages")}
              className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-colors flex justify-center items-center gap-2 relative ${
                activeTab === "messages" 
                  ? "bg-slate-100 border border-slate-200 text-blue-600" 
                  : "text-slate-500 hover:text-slate-800"
              }`}
            >
              <MessageSquare size={16} />
              Instant Chat
              {textMessages.length > 0 && (
                <span className="absolute top-2.5 right-4 px-2 py-0.5 text-[9px] bg-blue-600 text-white rounded-full font-extrabold">
                  {textMessages.length}
                </span>
              )}
            </button>
          </div>

          {/* VIEW RENDERER */}
          <div className="flex-1 min-h-[450px] rounded-3xl border border-slate-200 bg-white shadow-sm relative overflow-hidden flex flex-col" id="view-container">
            
            {/* 1. RADAR VIEW */}
            {activeTab === "radar" && (
              <div className="flex-1 flex flex-col items-center justify-between p-6 relative" id="radar-view">
                
                {/* Drag and Drop Hover Guide Overlay */}
                <AnimatePresence>
                  {dragActive && (
                    <motion.div 
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="absolute inset-0 bg-slate-950/90 z-20 flex flex-col items-center justify-center p-8 text-center border-3 border-dashed border-sky-500/50 rounded-3xl m-2"
                      id="drag-drop-overlay"
                    >
                      <div className="bg-sky-500/10 p-6 rounded-full border border-sky-500/30 mb-4 animate-bounce">
                        <Upload size={48} className="text-sky-400" />
                      </div>
                      <h3 className="text-2xl font-bold font-display text-slate-100">Drop Files Here</h3>
                      <p className="text-slate-400 text-sm mt-2 max-w-sm">
                        Release files to share them instantly with connected devices.
                      </p>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Info Header inside View */}
                <div className="text-center w-full max-w-md mx-auto relative z-10">
                  <h2 className="text-sm font-semibold text-slate-400">Discovering Other Devices</h2>
                  <p className="text-xs text-slate-500 mt-1">
                    Make sure the receiving device also has the Mauidrop page open.
                  </p>
                </div>

                {/* THE RADAR CANVAS */}
                <div className="relative flex-1 w-full flex items-center justify-center min-h-[300px]">
                  
                  {/* Glowing Pulse Rings */}
                  <div className="absolute w-[240px] h-[240px] rounded-full border border-blue-500/10 radar-ring pointer-events-none" />
                  <div className="absolute w-[240px] h-[240px] rounded-full border border-blue-500/10 radar-ring-delay-1 pointer-events-none" />
                  <div className="absolute w-[240px] h-[240px] rounded-full border border-blue-500/10 radar-ring-delay-2 pointer-events-none" />

                  {/* Concentric radar lines */}
                  <div className="absolute w-[280px] h-[280px] rounded-full border border-slate-200 pointer-events-none" />
                  <div className="absolute w-[180px] h-[180px] rounded-full border border-slate-200 pointer-events-none" />
                  <div className="absolute w-[80px] h-[80px] rounded-full border border-slate-150 pointer-events-none" />

                  {/* CENTER POINT: CURRENT USER DEVICE */}
                  <div className="relative z-10 flex flex-col items-center">
                    <motion.div 
                      whileHover={{ scale: 1.05 }}
                      className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-blue-600 to-sky-500 flex items-center justify-center text-white shadow-xl shadow-blue-500/15 border border-blue-400/20"
                      id="current-peer-radar-center"
                    >
                      {peer ? getDeviceIcon(peer.device, 24, "text-white") : <RefreshCw className="animate-spin text-white" size={24} />}
                    </motion.div>
                    <span className="text-[10px] mt-2 px-2 py-0.5 rounded-full bg-slate-100 border border-slate-200 text-slate-650 font-medium">
                      Me (You)
                    </span>
                  </div>

                  {/* PEER DEVICES MAP */}
                  <AnimatePresence>
                    {peers.map((p, index) => {
                      const pos = getPeerPosition(index, peers.length);
                      return (
                        <motion.div
                          key={p.id}
                          initial={{ scale: 0, opacity: 0, x: 0, y: 0 }}
                          animate={{ scale: 1, opacity: 1, x: pos.x, y: pos.y }}
                          exit={{ scale: 0, opacity: 0, x: 0, y: 0 }}
                          transition={{ type: "spring", stiffness: 100, damping: 15 }}
                          className="absolute z-10"
                        >
                          <button
                            onClick={() => handlePeerClick(p)}
                            className="flex flex-col items-center justify-center group cursor-pointer"
                            id={`peer-node-${p.id}`}
                          >
                            <div className="relative">
                              <div className="w-12 h-12 rounded-xl bg-white border border-slate-200 group-hover:border-blue-500 group-hover:bg-blue-50/50 flex items-center justify-center shadow-md group-hover:shadow-blue-500/5 transition-all">
                                {getDeviceIcon(p.device, 20, "text-slate-600 group-hover:text-blue-600 transition-colors")}
                              </div>
                              <div className="absolute -top-1.5 -right-1.5 bg-white border border-slate-200 rounded-md px-1 py-0.5 shadow-xs flex items-center justify-center scale-90 group-hover:scale-100 transition-transform">
                                {renderSignalIndicator(peerLatencies[p.id])}
                              </div>
                            </div>
                            <span className="text-[11px] font-medium text-slate-700 mt-1.5 group-hover:text-blue-600 transition-colors max-w-[90px] truncate text-center block">
                              {p.name}
                            </span>
                            <span className="text-[8px] font-mono text-slate-400 uppercase tracking-tight">
                              {getOSIcon(p.os).split(" ").pop()}
                            </span>
                          </button>
                        </motion.div>
                      );
                    })}
                  </AnimatePresence>

                  {/* NO PEERS STATE */}
                  {peers.length === 0 && (
                    <div className="absolute inset-x-4 text-center py-6 mt-32 max-w-xs mx-auto" id="no-peers-guide">
                      <p className="text-slate-500 text-xs font-medium">Open Mauidrop on another phone or laptop to start sending.</p>
                      <p className="text-slate-400 text-[10px] mt-1.5">Both devices must be on the same network to connect automatically.</p>
                    </div>
                  )}

                </div>

                {/* Bottom Visual Tooltip */}
                <div className="w-full text-center relative z-10 py-1 border-t border-slate-100">
                  <p className="text-[10px] text-slate-500">
                    💡 Click on a device above to send files or exchange messages instantly.
                  </p>
                </div>

              </div>
            )}

            {/* 2. TRANSFERS LIST VIEW */}
            {activeTab === "transfers" && (
              <div className="flex-1 flex flex-col p-6 overflow-hidden" id="transfers-view">
                <div className="flex items-center justify-between mb-4 border-b border-slate-200 pb-3">
                  <h2 className="text-base font-bold font-display text-slate-850 flex items-center gap-2">
                    <Activity size={18} className="text-blue-600" />
                    File Sharing Status
                  </h2>
                  <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-lg border border-slate-200 font-mono">
                    Total: {transfers.length}
                  </span>
                </div>

                <div className="flex-1 overflow-y-auto space-y-3 pr-1" id="transfers-scrollable-list">
                  <AnimatePresence initial={false}>
                    {transfers.map((tx) => (
                      <motion.div
                        key={tx.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        className="bg-slate-50 rounded-xl border border-slate-200/80 p-4 flex flex-col gap-3 shadow-xs hover:border-slate-300 transition-colors"
                        id={`transfer-item-${tx.id}`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-start gap-3 overflow-hidden">
                            <div className="p-2.5 rounded-lg bg-white border border-slate-200 shrink-0">
                              <FileText className="text-slate-500" size={18} />
                            </div>
                            <div className="overflow-hidden">
                              <h4 className="font-semibold text-xs text-slate-800 truncate max-w-[200px] sm:max-w-xs">{tx.fileName}</h4>
                              <p className="text-[10px] text-slate-500 mt-1 flex items-center gap-1.5 flex-wrap">
                                <span className="font-mono font-medium">{formatBytes(tx.fileSize)}</span>
                                <span className="text-slate-300">•</span>
                                <span>{tx.direction === "send" ? `To: ${tx.peerName}` : `From: ${tx.peerName}`}</span>
                              </p>
                            </div>
                          </div>

                          {/* Close/Cancel Button */}
                          {(tx.status === "transferring" || tx.status === "waiting-approval") && (
                            <button
                              onClick={() => cancelTransfer(tx.id, tx.peerId)}
                              className="p-1 rounded-lg hover:bg-slate-250/50 text-slate-400 hover:text-rose-650 transition-colors cursor-pointer"
                              title="Cancel"
                              id={`cancel-transfer-${tx.id}`}
                            >
                              <X size={14} />
                            </button>
                          )}
                        </div>

                        {/* Progress slider and info */}
                        <div className="space-y-1.5">
                          {/* Progress bar */}
                          <div className="w-full bg-slate-200/60 h-2 rounded-full overflow-hidden border border-slate-300/30">
                            <div 
                              className={`h-full transition-all duration-300 ${
                                tx.status === "completed" 
                                  ? "bg-emerald-500" 
                                  : tx.status === "failed" || tx.status === "rejected"
                                  ? "bg-rose-500"
                                  : "bg-blue-600"
                              }`}
                              style={{ width: `${tx.progress}%` }}
                            />
                          </div>

                          {/* Dynamic speed stats */}
                          <div className="flex items-center justify-between text-[10px] font-mono text-slate-500">
                            {tx.status === "transferring" ? (
                              <>
                                <span className="text-blue-600 font-semibold">{formatSpeed(tx.speed)}</span>
                                <span>{tx.progress}% ({formatBytes(tx.bytesTransferred)})</span>
                                <span className="text-slate-500">Remaining: {tx.eta > 0 ? `${tx.eta}s` : "Calculating..."}</span>
                              </>
                            ) : tx.status === "completed" ? (
                              <span className="text-emerald-600 font-medium flex items-center gap-1">
                                <CheckCircle2 size={12} className="text-emerald-500" /> Sent & downloaded successfully!
                              </span>
                            ) : tx.status === "waiting-approval" ? (
                              <span className="text-amber-600 font-medium flex items-center gap-1 animate-pulse">
                                <Activity size={12} /> Waiting for peer approval...
                              </span>
                            ) : tx.status === "rejected" ? (
                              <span className="text-rose-600 font-medium">
                                ❌ Rejected by recipient.
                              </span>
                            ) : tx.status === "failed" ? (
                              <span className="text-rose-600 font-medium">
                                ⚠️ Failed: {tx.error || "Failed to send."}
                              </span>
                            ) : (
                              <span className="text-slate-400">Initializing...</span>
                            )}
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </AnimatePresence>

                  {transfers.length === 0 && (
                    <div className="flex flex-col items-center justify-center text-center py-12" id="no-transfers-state">
                      <Upload className="text-slate-300 mb-2" size={32} />
                      <p className="text-slate-600 text-xs font-semibold">No Transfer History Yet</p>
                      <p className="text-slate-400 text-[10px] mt-1 max-w-[200px]">All file transfer histories will appear here.</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* 3. MESSAGES / TEXT CHAT VIEW */}
            {activeTab === "messages" && (
              <div className="flex-1 flex flex-col overflow-hidden h-full" id="messages-view">
                
                {/* Chat header selecting which peer */}
                <div className="p-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between shrink-0">
                  <div className="flex items-center gap-3">
                    <MessageSquare className="text-blue-650" size={18} />
                    <div>
                      <h3 className="text-sm font-semibold text-slate-800">
                        {activeChatPeer ? `Chat: ${activeChatPeer.name}` : "Select a Device to Chat"}
                      </h3>
                      <p className="text-[10px] text-slate-450 mt-0.5">
                        {activeChatPeer ? `Active connection (${getOSIcon(activeChatPeer.os).split(" ").pop()})` : "Instant chat to send text/links"}
                      </p>
                    </div>
                  </div>

                  {/* Desktop Dropdown to change active chat peer */}
                  {peers.length > 0 && (
                    <select
                      value={activeChatPeer?.id || ""}
                      onChange={(e) => {
                        const target = peers.find((p) => p.id === e.target.value);
                        if (target) setActiveChatPeer(target);
                      }}
                      className="bg-white border border-slate-200 text-slate-700 text-xs rounded-lg px-2 py-1.5 focus:outline-none focus:border-blue-500"
                      id="chat-peer-dropdown"
                    >
                      <option value="" disabled>Select device...</option>
                      {peers.map((p) => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                  )}
                </div>

                {/* Chat messages body */}
                <div className="flex-1 p-4 overflow-y-auto space-y-3 bg-white" id="chat-messages-scroll-area">
                  {activeChatPeer ? (
                    <>
                      {textMessages
                        .filter((msg) => msg.peerId === activeChatPeer.id)
                        .map((msg) => (
                          <div 
                            key={msg.id} 
                            className={`flex flex-col max-w-[85%] ${msg.direction === "send" ? "ml-auto items-end" : "mr-auto items-start"}`}
                            id={`message-bubble-${msg.id}`}
                          >
                            <span className="text-[9px] text-slate-400 font-mono mb-0.5">
                              {msg.direction === "send" ? "You" : msg.peerName} • {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                            <div className="flex items-end gap-1.5 group">
                              {msg.direction === "receive" && (
                                <button
                                  onClick={() => {
                                    navigator.clipboard.writeText(msg.text);
                                  }}
                                  className="p-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-400 hover:text-slate-600 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer border border-slate-200/50"
                                  title="Copy Text"
                                  id={`copy-chat-msg-${msg.id}`}
                                >
                                  <Copy size={11} />
                                </button>
                              )}
                              <div className={`p-3 rounded-2xl text-xs leading-relaxed ${
                                msg.direction === "send" 
                                  ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-tr-none font-medium shadow-xs" 
                                  : "bg-slate-50 border border-slate-200/80 text-slate-800 rounded-tl-none"
                              }`}>
                                {msg.text}
                              </div>
                              {msg.direction === "send" && (
                                <button
                                  onClick={() => {
                                    navigator.clipboard.writeText(msg.text);
                                  }}
                                  className="p-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-400 hover:text-slate-600 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer border border-slate-200/50"
                                  title="Copy Text"
                                  id={`copy-chat-msg-${msg.id}`}
                                >
                                  <Copy size={11} />
                                </button>
                              )}
                            </div>
                          </div>
                        ))}

                      {textMessages.filter((msg) => msg.peerId === activeChatPeer.id).length === 0 && (
                        <div className="h-full flex flex-col items-center justify-center text-center py-12" id="no-chats-with-peer">
                          <MessageSquare className="text-slate-300 mb-2" size={28} />
                          <p className="text-slate-500 text-xs font-semibold">Send First Message</p>
                          <p className="text-slate-400 text-[10px] mt-1 max-w-[200px]">
                            Use the panel below to send instant text, links, or memos to {activeChatPeer.name}.
                          </p>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="h-full flex flex-col items-center justify-center text-center py-12" id="chat-no-peer-selected">
                      <MessageSquare className="text-slate-300 mb-2" size={32} />
                      <p className="text-slate-500 text-xs font-semibold">No Active Chats Yet</p>
                      <p className="text-slate-400 text-[10px] mt-1 max-w-xs">
                        {peers.length > 0 
                          ? "Select a device on the radar or use the dropdown at the top right to start chatting." 
                          : "Please connect another device first."}
                      </p>
                    </div>
                  )}
                  <div ref={chatBottomRef} />
                </div>

                {/* Chat input box */}
                {activeChatPeer && (
                  <form onSubmit={handleSendChat} className="p-3 border-t border-slate-200 bg-slate-50 flex gap-2 shrink-0" id="chat-input-form">
                    <input
                      type="text"
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      placeholder={`Send text to ${activeChatPeer.name}...`}
                      className="flex-1 bg-white border border-slate-200 rounded-xl px-4 py-2 text-xs text-slate-800 focus:outline-none focus:border-blue-500 placeholder-slate-400"
                      id="chat-text-input"
                    />
                    <button
                      type="submit"
                      className="p-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold transition-all hover:scale-105 cursor-pointer shadow-md shadow-blue-500/10 shrink-0"
                      id="chat-send-submit"
                    >
                      <Send size={16} id="icon-send-chat" />
                    </button>
                  </form>
                )}

              </div>
            )}

          </div>

        </div>

      </main>

      {/* HIDDEN RAW FILE INPUT */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        className="hidden"
        id="raw-file-input"
      />

      {/* POPUPS & MODALS OVERLAYS */}

      {/* 1. ROOM MODAL: SELECTION & CUSTOM ROOM */}
      <AnimatePresence>
        {isRoomModalOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50"
            id="room-modal-overlay"
          >
            <motion.div 
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              className="w-full max-w-sm bg-white border border-slate-200 rounded-2xl p-5 shadow-2xl relative"
              id="room-modal-card"
            >
              <button
                onClick={() => setIsRoomModalOpen(false)}
                className="absolute top-4 right-4 p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-700 transition-colors cursor-pointer border border-transparent"
                id="close-room-modal"
              >
                <X size={16} />
              </button>

              <h3 className="text-lg font-bold font-display text-slate-800 flex items-center gap-2 mb-2">
                <Wifi size={18} className="text-blue-600" />
                Change Mauidrop Room
              </h3>
              <p className="text-xs text-slate-500 leading-normal mb-4">
                By default, Mauidrop groups devices by Wi-Fi IP. Enter a custom room code if devices are on different networks.
              </p>

              <div className="space-y-4">
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">Current Room Code</label>
                  <p className="text-xs font-mono font-bold text-blue-600 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                    {isCustomRoom ? roomCode : `Local (Hashed IP: ${roomCode})`}
                  </p>
                </div>

                <div className="border-t border-slate-100 pt-3">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">Join Custom Room</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="e.g., myclass, work"
                      value={customRoomInput}
                      onChange={(e) => setCustomRoomInput(e.target.value)}
                      className="flex-1 bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-800 focus:outline-none focus:border-blue-500 font-mono placeholder-slate-400"
                      id="custom-room-input-field"
                    />
                    <button
                      onClick={() => {
                        joinRoom(customRoomInput);
                        setIsRoomModalOpen(false);
                        setCustomRoomInput("");
                      }}
                      className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs transition-colors cursor-pointer shrink-0 shadow-xs"
                      id="custom-room-join-submit"
                    >
                      Join
                    </button>
                  </div>
                </div>

                {isCustomRoom && (
                  <button
                    onClick={() => {
                      joinRoom(); // Back to default
                      setIsRoomModalOpen(false);
                    }}
                    className="w-full py-2 text-xs font-semibold text-rose-600 border border-rose-200 bg-rose-50 hover:bg-rose-100 rounded-lg transition-colors cursor-pointer mt-2"
                    id="reset-room-to-default"
                  >
                    Back to Primary Wi-Fi Room
                  </button>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 2. HELP MODAL */}
      <AnimatePresence>
        {isHelpOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50"
            id="help-modal-overlay"
          >
            <motion.div 
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              className="w-full max-w-md bg-white border border-slate-200 rounded-2xl p-6 shadow-2xl relative max-h-[90vh] overflow-y-auto"
              id="help-modal-card"
            >
              <button
                onClick={() => setIsHelpOpen(false)}
                className="absolute top-4 right-4 p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-700 transition-colors cursor-pointer border border-transparent"
                id="close-help-modal"
              >
                <X size={16} />
              </button>

              <h3 className="text-lg font-bold font-display text-slate-800 mb-3 flex items-center gap-2">
                <Sparkles size={18} className="text-blue-600" />
                About Mauidrop
              </h3>
              
              <div className="space-y-4 text-xs text-slate-600 leading-relaxed">
                <div>
                  <h4 className="font-bold text-slate-800 mb-1">What is Mauidrop?</h4>
                  <p>
                    Mauidrop is an instant web-based file sharing application (inspired by Snapdrop) running fully in your browser. It's extremely lightweight, fast, and secure!
                  </p>
                </div>

                <div>
                  <h4 className="font-bold text-slate-800 mb-1">How to share files?</h4>
                  <ol className="list-decimal list-inside space-y-1.5 pl-1">
                    <li>Connect both devices (phone, tablet, or computer) to the <strong>same Wi-Fi network</strong>.</li>
                    <li>Open the Mauidrop app on both devices.</li>
                    <li>Other devices will automatically appear on the <strong>Radar</strong> with a unique name (e.g., <em>Silver Dolphin</em>).</li>
                    <li>Click on the target device's icon, select files, and that's it! The recipient only needs to click "Accept" to start downloading automatically.</li>
                  </ol>
                </div>

                <div>
                  <h4 className="font-bold text-slate-800 mb-1">Connection Outside Wi-Fi (Custom Room)</h4>
                  <p>
                    If devices use different networks (e.g., one on Mobile Data and another on Wi-Fi), you can still share! Click the <strong>Room</strong> button at the top, then join the same custom room code on both devices.
                  </p>
                </div>

                <div>
                  <h4 className="font-bold text-slate-800 mb-1">Text Messaging Feature</h4>
                  <p>
                    In addition to files, you can exchange memos, URLs, or instant text copies. Simply click the target device on the radar, choose "Send Message", and send your text. A 1-click copy button is also available to easily grab the text or link!
                  </p>
                </div>
              </div>

              <button
                onClick={() => setIsHelpOpen(false)}
                className="w-full mt-5 py-2 bg-slate-100 hover:bg-slate-250/50 text-slate-700 hover:text-slate-900 rounded-lg font-semibold text-xs transition-colors cursor-pointer border border-slate-200"
                id="help-modal-close-submit"
              >
                I Understand
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 3. PEER ACTION MENU DRAWER/POPUP */}
      <AnimatePresence>
        {peerActionMenu && (
          <div 
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-40"
            onClick={() => setPeerActionMenu(null)}
            id="peer-action-overlay"
          >
            <motion.div 
              initial={{ scale: 0.95, y: 15 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 15 }}
              className="w-full max-w-xs bg-white border border-slate-200 rounded-2xl p-5 shadow-2xl relative"
              onClick={(e) => e.stopPropagation()} // Prevent closing
              id="peer-action-card"
            >
              <button
                onClick={() => setPeerActionMenu(null)}
                className="absolute top-4 right-4 p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-700 transition-colors cursor-pointer border border-transparent"
                id="close-peer-action"
              >
                <X size={14} />
              </button>

              <div className="flex flex-col items-center text-center gap-2 mb-4">
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 shadow-xs">
                  {getDeviceIcon(peerActionMenu.device, 26, "text-slate-700")}
                </div>
                <div>
                  <h3 className="font-bold text-sm text-slate-800 font-display">{peerActionMenu.name}</h3>
                  <span className="text-[10px] text-slate-500 px-2 py-0.5 rounded-md bg-slate-100 border border-slate-200 inline-block mt-1 font-medium">
                    {getOSIcon(peerActionMenu.os)}
                  </span>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <button
                  onClick={() => {
                    triggerFileInput(peerActionMenu.id);
                  }}
                  className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs transition-all flex items-center justify-center gap-2 cursor-pointer shadow-md shadow-blue-500/10"
                  id="action-send-file"
                >
                  <Upload size={14} />
                  Send File / Document
                </button>
                <button
                  onClick={() => triggerChat(peerActionMenu)}
                  className="w-full py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 hover:text-slate-900 font-bold text-xs transition-all flex items-center justify-center gap-2 cursor-pointer"
                  id="action-chat-text"
                >
                  <MessageSquare size={14} />
                  Send Chat / Text
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 4. CHOOSE PEER FOR DROPPED FILE MODAL */}
      <AnimatePresence>
        {selectedPeerForDrop && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50"
            id="drop-peer-selector-overlay"
          >
            <motion.div 
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              className="w-full max-w-sm bg-white border border-slate-200 rounded-2xl p-5 shadow-2xl relative"
              id="drop-peer-selector-card"
            >
              <button
                onClick={() => setSelectedPeerForDrop(null)}
                className="absolute top-4 right-4 p-1.5 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-700 transition-colors cursor-pointer border border-transparent"
                id="close-drop-selector"
              >
                <X size={16} />
              </button>

              <h3 className="text-base font-bold font-display text-slate-800 flex items-center gap-2 mb-1">
                <Share2 size={16} className="text-blue-600" />
                Select File Recipient
              </h3>
              <p className="text-xs text-slate-500 leading-normal mb-3 truncate">
                File: <span className="font-mono text-slate-700 font-semibold">{selectedPeerForDrop.name}</span>
              </p>

              <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                {peers.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => {
                      sendFile(p.id, p.name, selectedPeerForDrop);
                      setSelectedPeerForDrop(null);
                    }}
                    className="w-full p-3 rounded-xl bg-slate-50 border border-slate-200/80 hover:border-blue-500/50 hover:bg-blue-50/20 flex items-center gap-3 text-left transition-all cursor-pointer"
                    id={`drop-target-peer-${p.id}`}
                  >
                    <div className="p-1.5 rounded-lg bg-white border border-slate-200">
                      {getDeviceIcon(p.device, 16, "text-slate-600")}
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-slate-800">{p.name}</p>
                      <p className="text-[10px] text-slate-400">{getOSIcon(p.os)}</p>
                    </div>
                  </button>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 5. FLOATING OVERLAY: INCOMING TRANSFER APPROVAL PANEL */}
      <AnimatePresence>
        {incomingApproval && (
          <div className="fixed bottom-6 left-6 right-6 sm:left-auto sm:right-6 sm:w-96 z-40" id="incoming-alert-container">
            <motion.div 
              initial={{ opacity: 0, y: 50, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20 }}
              className="bg-white border-2 border-blue-600 rounded-2xl p-4 shadow-2xl flex flex-col gap-3"
              id="incoming-approval-card"
            >
              <div className="flex items-start gap-3">
                <div className="p-3 rounded-xl bg-blue-50 border border-blue-100 text-blue-600">
                  <Download size={22} className="animate-bounce text-blue-600" id="icon-incoming-download" />
                </div>
                <div className="overflow-hidden flex-1">
                  <span className="text-[9px] font-bold text-blue-600 uppercase tracking-widest block font-sans">Incoming File Request</span>
                  <h4 className="font-bold text-sm text-slate-800 truncate mt-0.5" title={incomingApproval.fileName}>{incomingApproval.fileName}</h4>
                  <p className="text-xs text-slate-500 mt-1">
                    Size: <strong className="font-mono">{formatBytes(incomingApproval.fileSize)}</strong>
                  </p>
                  <p className="text-[10px] text-slate-440 mt-0.5">
                    From: <strong>{incomingApproval.peerName}</strong>
                  </p>
                </div>
              </div>

              <div className="flex gap-2.5 mt-1">
                <button
                  onClick={() => rejectTransfer(incomingApproval.id, incomingApproval.peerId)}
                  className="flex-1 py-2 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 text-slate-500 hover:text-rose-600 font-semibold text-xs transition-colors cursor-pointer"
                  id="reject-incoming-transfer"
                >
                  Reject File
                </button>
                <button
                  onClick={() => acceptTransfer(incomingApproval.id, incomingApproval.peerId)}
                  className="flex-1 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs transition-colors cursor-pointer shadow-lg shadow-blue-500/10"
                  id="accept-incoming-transfer"
                >
                  Accept File
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* FOOTER BRASS BRAND */}
      <footer className="border-t border-slate-100 py-3.5 px-4 text-center text-[10px] text-slate-400 mt-auto bg-white/50" id="mauidrop-footer">
        <p className="max-w-xl mx-auto leading-relaxed font-sans">
          Mauidrop is secure, free, and does not store your files. Files are transferred instantly via local peer-to-peer encryption or secure WebSocket relay.
        </p>
      </footer>

    </div>
  );
}
