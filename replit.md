# Discord Clone MVP

## Overview

A fully working Discord-like web app with real-time messaging, friend system, group chats, and WebRTC voice calls.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5 + Socket.IO
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Frontend**: React + Vite + Tailwind CSS
- **Auth**: JWT + bcryptjs
- **Real-time**: Socket.IO
- **Voice**: WebRTC (audio-only, peer-to-peer)

## Structure

```text
artifacts/
  api-server/         # Express + Socket.IO backend
  discord-clone/      # React frontend
lib/
  api-spec/           # OpenAPI spec + Orval codegen config
  api-client-react/   # Generated React Query hooks
  api-zod/            # Generated Zod schemas
  db/                 # Drizzle ORM schema + DB connection
```

## Database Schema

- `users` — id, username, password_hash, created_at
- `friend_requests` — id, sender_id, receiver_id, status (pending|accepted)
- `messages` — id, sender_id, content, dm_user_id, group_id, created_at
- `groups` — id, name, created_by_id, created_at
- `group_members` — id, group_id, user_id

## API Routes

- `POST /api/auth/register` — register
- `POST /api/auth/login` — login
- `GET /api/auth/me` — get current user (JWT)
- `GET /api/users/search?q=` — search users
- `GET /api/friends` — get friends list
- `GET /api/friends/requests` — get pending friend requests
- `POST /api/friends/request` — send friend request
- `POST /api/friends/accept` — accept friend request
- `GET /api/messages/dm/:userId` — get DM message history
- `GET /api/groups` — get my groups
- `POST /api/groups` — create a group
- `GET /api/groups/:groupId/messages` — get group message history

## Socket.IO Events

Client → Server:
- `dm_message` { toUserId, content } — send DM
- `group_message` { groupId, content } — send group message
- `join_call` { roomId } — join voice call room
- `leave_call` { roomId } — leave voice call room
- `webrtc_offer` { to: socketId, offer } — WebRTC offer
- `webrtc_answer` { to: socketId, answer } — WebRTC answer
- `webrtc_ice` { to: socketId, candidate } — ICE candidate

Server → Client:
- `dm_message` — new DM received
- `group_message` — new group message received
- `user_joined_call` { socketId, userId, username } — user joined call
- `user_left_call` { socketId, userId } — user left call
- `call_full` — call is at capacity (3 users)
- `call_joined` { roomId, existingUsers } — confirmation of call join
- `webrtc_offer` / `webrtc_answer` / `webrtc_ice` — relayed WebRTC signaling

## Auth

- JWT stored in `localStorage["discord_token"]`
- Socket.IO auth via `socket.handshake.auth.token`
- Voice call room IDs: `dm_{userId}` or `group_{groupId}`
