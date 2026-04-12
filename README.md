<div align="center">

# 🧋 BobaCord

**A highly polished, scalable, and real-time communication platform featuring Mediasoup SFU Voice & Video Channels.**

[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=for-the-badge&logo=typescript&logoColor=white)](#)
[![React](https://img.shields.io/badge/React-20232A?style=for-the-badge&logo=react&logoColor=61DAFB)](#)
[![Node.js](https://img.shields.io/badge/Node.js-339933?style=for-the-badge&logo=nodedotjs&logoColor=white)](#)
[![Socket.io](https://img.shields.io/badge/Socket.io-010101?style=for-the-badge&logo=socketdotio&logoColor=white)](#)
[![TailwindCSS](https://img.shields.io/badge/Tailwind_CSS-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white)](#)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.style=for-the-badge)](#)
[![Contributions Welcome](https://img.shields.io/badge/Contributions-Welcome-brightgreen.style=for-the-badge)](#)

*A premium, high-fidelity chat experience with seamless real-time communication.*

</div>

---

## 📖 Project Overview

**BobaCord** is a fully functional, production-ready web application designed for high-fidelity communication. It was built to demonstrate how to implement scalable real-time systems by combining standard WebSocket message brokering with an advanced Mediasoup-powered SFU (Selective Forwarding Unit) for voice and video media routing.

**The Problem it Solves:** 
Building a scalable real-time application that handles both instant messaging and peer-to-peer/multi-party voice calls is notoriously complex. BobaCord provides a clean, monorepo-based architecture that separates signaling, data persistence, and heavy media routing into easily understandable microservices. 

**Who is this for?**
Engineers looking for a comprehensive reference architecture for real-time applications, developers wanting to learn WebRTC/SFU integrations, and open-source enthusiasts looking for a highly polished foundation for their own communication apps.

---

## ✨ Key Features

- **💬 Real-Time Messaging:** Instant delivery of Direct Messages (DMs) and Group Chat messages with zero latency.
- **🎙️ Scalable Voice & Video (SFU):** Multi-party voice channels powered by Mediasoup, reducing client-side bandwidth compared to standard WebRTC mesh networks.
- **👥 Advanced Friend System:** Send, accept, decline, and track friend requests. 
- **🟢 Live Presence:** Real-time online/offline status updates and active call presence tracking.
- **🔔 Smart Notifications:** Unread message badges, visual desktop indicators, and customizable UI sound effects.
- **🎨 User Profiles:** Customizable avatars, bios, and personalized user profiles with quick-access popups.
- **📱 Responsive & Fluid Layout:** Adapts beautifully from large desktop monitors to split-screen setups.

---

## 🔍 Feature Highlights

### Advanced Voice Infrastructure
Unlike basic WebRTC applications that use a P2P mesh (which fails to scale past 3-4 users), BobaCord implements a **Mediasoup SFU Server**. This centralized media routing allows channels to scale effectively, handling dynamic audio/video producers and consumers, packet loss, and robust codec negotiation (Opus, VP8, VP9, H264) effortlessly.

### Monorepo & Type Safety
The entire workspace is managed via `pnpm` workspaces. Types are fully shared across the frontend and backend using **Zod** and **Orval** OpenAPI codegen, ensuring that the database schema (via Drizzle ORM) natively aligns with the frontend React Query hooks. 

---

## 💎 UI / UX Highlights

BobaCord features a custom **"Ink & Focus"** design system:
- **Ultra-Deep Dark Mode:** Uses rich, true-dark backgrounds (`#040406`) combined with contrasting "Prism Cyan" and "Boba Violet" glows.
- **Glassmorphism:** Context menus, sidebars, and modals use sleek `.glass` and `.glass-panel` utilities with heavy background blurs.
- **Micro-Interactions:** Smooth, physically modeled animations powered by Framer Motion (page transitions, message slide-ins, badge pings).
- **Distraction-Free Focus:** A clean, uncluttered interface that prioritizes readability, context, and the content of your conversations.

---

## 🏗️ System Architecture

The application is split into distinct, decoupled services:

1. **API Server (`artifacts/api-server`)**: An Express & Socket.io server handling authentication, message routing, presence, DB reads/writes, and WebSocket signaling.
2. **Voice Server (`artifacts/voice-server`)**: A dedicated Node.js Mediasoup worker that explicitly processes and routes deep WebRTC media tracks (RTP/RTCP).
3. **Database Layer (`lib/db`)**: Powered by Drizzle ORM (SQLite variant), enabling type-safe zero-overhead queries.
4. **Client (`artifacts/discord-clone`)**: The Vite + React SPA that consumes generated React Query hooks and manages complex UI state.

---

## 🛠️ Tech Stack

### Frontend
- **React.js 19**
- **Vite** (Build Tool)
- **Wouter** (Minimalist Routing)
- **Tailwind CSS v4** (Styling & Glassmorphism)
- **Framer Motion** (Animations)
- **React Query (TanStack)** (Data fetching)

### Backend
- **Node.js**
- **Express.js** 
- **Socket.io** (WebSockets)
- **Mediasoup** (WebRTC SFU)
- **Bcrypt & JWT** (Authentication)

### Database & Tooling
- **SQLite / PostgreSQL** (via Drizzle ORM)
- **Zod & Drizzle-Zod** (Schema validation)
- **Orval** (API Codegen)
- **PNPM Workspaces** (Monorepo management)

---

## 📸 Screenshots & Demo

<div align="center">
  
*Placeholders for actual project screenshots*

| 💬 Main Chat Interface | 🎙️ Active Voice Call |
| :---: | :---: |
| <img src="https://via.placeholder.com/600x400/040406/9167e4?text=Chat+Interface+Screenshot" alt="Chat UI" width="100%"> | <img src="https://via.placeholder.com/600x400/040406/f472b6?text=Voice+Call+Overlay" alt="Voice Call UI" width="100%"> |

| 👥 Friends & Requests | ⚙️ Profile Settings |
| :---: | :---: |
| <img src="https://via.placeholder.com/600x400/040406/8b5cf6?text=Friends+Tab" alt="Friends UI" width="100%"> | <img src="https://via.placeholder.com/600x400/040406/38bdf8?text=Settings+Modal" alt="Settings UI" width="100%"> |

</div>

---

## 🚀 Installation Guide

Follow these steps to run BobaCord locally on your machine.

### Prerequisites
- Node.js (v20+ recommended)
- `pnpm` package manager (`npm install -g pnpm`)
- Python & C++ Build Tools (required for compiling Mediasoup binaries)

### Setup Instructions

1. **Clone the repository:**
   ```bash
   git clone https://github.com/yourusername/bobacord.git
   cd bobacord
   ```

2. **Install dependencies:**
   ```bash
   pnpm install
   ```

3. **Environment Setup:**
   Create `.env` files in the respective directories based on the `.env.example` configurations. (Ensure `api-server` and `voice-server` ports don't conflict).

4. **Initialize Database (Drizzle):**
   *(Ensure you run the specific package script to push schemas to the database)*
   ```bash
   pnpm --filter @workspace/db run push
   ```

5. **Start the Development Servers:**
   Run the entire monorepo concurrently:
   ```bash
   pnpm run dev
   ```

This will spin up the Vite frontend, Express API Server, and Mediasoup Voice Server simultaneously.

---

## 💡 Usage

1. **Register/Login:** Navigate to `http://localhost:5173`. Create a new user account.
2. **Add Friends:** Click on the "Friends" tab, search for a username, and send a request.
3. **Start Chatting:** Open a DM by clicking on an accepted friend in the sidebar.
4. **Group Chats:** Use the `+` icon on the sidebar under "Group Chats", select multiple friends, and create a room.
5. **Start a Call:** In any DM or Group Chat, hit the "Start Call" button in the top right to initialize the SFU voice connection.

---

## 📂 Project Structure

```text
bobacord/
├── artifacts/
│   ├── api-server/         # Main Express & Socket.IO backend
│   ├── discord-clone/      # React + Vite frontend SPA
│   ├── voice-server/       # Mediasoup WebRTC SFU server
│   └── mockup-sandbox/     # UI testing arena
├── lib/
│   ├── api-spec/           # OpenAPI specs & definitions
│   ├── api-zod/            # Shared Zod validation schemas
│   ├── api-client-react/   # Generated React Query hooks (via Orval)
│   └── db/                 # Drizzle ORM schemas and DB connection
├── scripts/                # CI/CD & utility scripts
├── pnpm-workspace.yaml     # Monorepo configuration
└── package.json
```

---

## 🗺️ Future Improvements / Roadmap

- [ ] **Typing Indicators:** Real-time visual feedback when a user is typing a message in DM/Groups.
- [ ] **Read Receipts:** Sync message read states properly across multiple active devices.
- [ ] **Message Attachments:** Allow users to upload and share images/files via AWS S3 / Cloudflare R2.
- [ ] **Rich Media Embeds:** Auto-parse links and provide rich graphic embeds (OpenGraph integration).

---

## 🤝 Contributing

Contributions are what make the open-source community such an amazing place to learn, inspire, and create. Any contributions you make are **greatly appreciated**.

1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request