# 🌊 Mauidrop

[![React](https://img.shields.io/badge/React-19.x-blue.svg?logo=react)](https://react.dev/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-v4-38B2AC.svg?logo=tailwindcss)](https://tailwindcss.com/)
[![Vite](https://img.shields.io/badge/Vite-6.x-646CFF.svg?logo=vite)](https://vite.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178C6.svg?logo=typescript)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Mauidrop is a **high-performance, secure, and visually polished file-sharing web application** inspired by Snapdrop. It enables users to transfer files and swap text messages instantly across multiple devices directly within their browsers. 

With a premium **hybrid WebRTC peer-to-peer connection and automated WebSocket chunking fallback**, Mauidrop is engineered for maximum reliability, speed, and cross-network resilience.

---

## 🚀 Why Developers Love Mauidrop (Core Architecture)

Mauidrop is not just a standard single-page app; it features a robust transport and coordination layer built for latency-critical tasks:

```
                  ┌───────────────────────────────┐
                  │      Mauidrop Signaler        │
                  │   (Express + WebSocket/ws)    │
                  └──────────────┬────────────────┘
                                 │ (Signaling / Room Pairing)
                                 ▼
             ┌─────────────────────────────────────────┐
             │   WebRTC P2P Direct DataChannel         │
             │   - Ultra-fast 64KB Chunk Streaming     │
             │   - Dynamic ETA & Speed Calculation    │
             └───────────────────┬─────────────────────┘
                                 │
                     [ STUCK / NAT RESTRICTED? ]
                                 │ (3-second failover timer)
                                 ▼
             ┌─────────────────────────────────────────┐
             │   Secure WebSocket Chunking Fallback    │
             │   - Base64 encoded array buffer streams │
             │   - Guaranteed multi-network delivery   │
             └─────────────────────────────────────────┘
```

### 1. The Hybrid Transport Engine (`useMauidrop.ts`)
*   **WebRTC-First Routing:** Attempts direct P2P data channel negotiation using an Express-based signaling gateway for maximum throughput.
*   **Sub-3-Second WebSocket Failover:** If WebRTC is blocked by strict symmetric NATs or corporate firewalls, Mauidrop seamlessly falls back to chunked Base64 stream transfers over secure WebSockets.
*   **Flow-Controlled Chunking:** Reads files asynchronously using the `FileReader` API in `64 KB` chunks, keeping memory utilization minimal on both mobile and desktop browsers.

### 2. Automatic Local Room Discovery
*   **IP-Hashed Pairings:** By default, the Express server hashes incoming client IP addresses to instantly group devices on the same Wi-Fi network into a shared room without requiring user accounts or logins.
*   **Custom Room Keys:** Need to transfer files across mobile data (LTE) and local Wi-Fi? Users can input a custom Room Code to bridge networks instantly.

### 3. Beautiful UI & Polish
*   **Minimalist Canvas & Slate Theme:** Crafted with generous negative space, soft borders, a subtle radar visualizer, and a clean light layout utilizing **Tailwind CSS v4**.
*   **Fluid Micro-animations:** Uses `motion` (Framer Motion) for natural, bouncy entries, tab transitions, progress sliders, and slide-up modal interactions.
*   **Dual Utility:** Integrates immediate text/URL sharing with copy-to-clipboard functionality alongside full binary file transfers.

---

## ✨ Features At A Glance

*   **Zero Setup File Sharing:** Drag-and-drop or file selector uploads for any extension.
*   **Instant Text Chat:** Share links, verification codes, or general notes.
*   **Real-Time Metrics:** Beautiful progress indicators, current speed (MB/s or KB/s), and real-time Estimated Time of Arrival (ETA).
*   **Responsive Multi-Device Layout:** Perfect visual scaling across desktops, tablets, and smartphones.
*   **Native OS Detection:** Dynamic icons for Windows, macOS, Linux, Android, iOS, and general Web hosts.

---

## 🛠️ Project Structure

```filepath
├── server.ts                 # Express signalling server, WebSocket handler & static asset router
├── src/
│   ├── App.tsx               # Main visual layout, dashboard views, modals, and dynamic radar component
│   ├── types.ts              # TypeScript definitions for Peers, Transfers, and Messages
│   ├── main.tsx              # React client entry point
│   ├── index.css             # Tailwind v4 configuration, display typography, and keyframe radar rings
│   └── hooks/
│       └── useMauidrop.ts    # WebRTC connection coordinator, signaling listener, and chunk processor
├── package.json              # Bundled script utilities (Vite, esbuild, typescript, tsx)
└── tsconfig.json             # Core strict TypeScript configuration
```

---

## 💻 Technical Setup & Local Development

Ensure you have [Node.js](https://nodejs.org/) installed (version 18 or newer recommended).

### 1. Install Dependencies
```bash
npm install
```

### 2. Run in Development Mode
This launches the integrated Express backend and mount's Vite's Hot Module Replacement (HMR) server:
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser. Open a second window or another device on the same local network to start sharing!

### 3. Compile & Bundle (Production Build)
To compile the TypeScript server and bundle the React frontend into highly optimized production static assets:
```bash
npm run build
```
This produces a self-contained, high-performance CommonJS server at `dist/server.cjs` and optimized client bundles in `dist/`.

### 4. Run Production Server
```bash
npm start
```

---

## 🔮 Roadmap: Exciting Paths for Future Developers

Mauidrop has a highly extensible foundations. Here are several exciting areas where you can jump in and contribute to take the project to the next level:

### 🌟 1. End-to-End Encryption (E2EE)
*   **Concept:** Implement browser-native Web Crypto API to perform Diffie-Hellman key exchanges over the signaling channel.
*   **Impact:** Ensures that even when falling back to the WebSocket proxy server, the chunks remain completely unreadable to anyone but the recipient.

### 📶 2. Web Share Target API Integration
*   **Concept:** Configure a Progressive Web App (PWA) manifest that allows Mauidrop to register as a system-level share target on iOS and Android.
*   **Impact:** Users will be able to share photos or links directly from their native system gallery/browser directly to Mauidrop with a single tap.

### 🌍 3. Peer-to-Peer Multi-Recipient Broadcasts
*   **Concept:** Extend `useMauidrop.ts` to coordinate simultaneous WebRTC data channels with multiple peers at once.
*   **Impact:** Stream a single file to 3 or 4 connected devices in your room simultaneously instead of initiating individual consecutive transfers.

### 📱 4. QR Code Fast Join
*   **Concept:** Auto-generate a beautiful QR code containing the custom Room URL in the Room Modal.
*   **Impact:** Users can scan the QR code from their mobile phone camera to instantly jump into the exact same room, entirely bypassing manual input.

### 📦 5. Native Desktop Wrappers
*   **Concept:** Wrap Mauidrop in Tauri or Electron, utilizing native OS APIs to support drag-and-drop from the system tray or menu bar.
*   **Impact:** Build an exquisite, lightweight, globally accessible desktop dropshelf.

---

## 🛡️ License

Distributed under the MIT License. See `LICENSE` for more information.

---

*Let's build the future of localized file sharing together. Feel free to open issues, submit pull requests, or share your feedback!* 🌊
