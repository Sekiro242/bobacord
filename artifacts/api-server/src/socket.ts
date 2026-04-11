import { Server as SocketServer } from "socket.io";
import { Server as HttpServer } from "http";
import { verifyToken } from "./lib/auth.js";
import { db } from "@workspace/db";
import { messagesTable, groupMembersTable, usersTable, dmMetadataTable, groupsTable } from "@workspace/db/schema";
import { eq, and } from "drizzle-orm";
import { logger } from "./lib/logger.js";

// ─── In-memory voice room presence ───────────────────────────────────────────
// Only tracks who is in which room — media is handled by voice-server.
interface VoicePeer {
  userId: number;
  username: string;
  avatarUrl?: string | null;
  peerId: string; // "user_{userId}"
}

const voiceRooms = new Map<string, Map<string, VoicePeer>>(); // roomId → socketId → peer

export function setupSocket(httpServer: HttpServer) {
  const io = new SocketServer(httpServer, {
    cors: { origin: "*" },
    path: "/socket.io",
    transports: ["polling", "websocket"],
  });

  // ─── Auth middleware ────────────────────────────────────────────────────────
  io.use((socket, next) => {
    const token = socket.handshake.auth.token as string;
    if (!token) {
      logger.warn("Socket auth failed: no token");
      next(new Error("No token"));
      return;
    }
    try {
      const user = verifyToken(token);
      (socket as any).user = user;
      next();
    } catch {
      logger.warn("Socket auth failed: invalid token");
      next(new Error("Invalid token"));
    }
  });

  io.on("connection", (socket) => {
    const user = (socket as any).user as { id: number; username: string };
    logger.info({ userId: user.id, username: user.username, socketId: socket.id }, "Socket connected");

    // Personal room for targeted messages (DMs, call invites etc.)
    socket.join(`user_${user.id}`);

    // ── Disconnect: clean up voice rooms ────────────────────────────────────
    socket.on("disconnect", (reason) => {
      logger.info({ userId: user.id, socketId: socket.id, reason }, "Socket disconnected");
      // Remove from any active voice rooms on disconnect
      for (const [roomId, peers] of voiceRooms.entries()) {
        if (peers.has(socket.id)) {
          leaveVoiceRoom(socket, roomId, user);
        }
      }
    });

    // ─── MESSAGING ────────────────────────────────────────────────────────────

    socket.on("dm_message", async (data: { toUserId: number; content: string }) => {
      logger.info({ from: user.id, to: data.toUserId }, "dm_message received");
      if (!data.toUserId || !data.content?.trim()) return;
      try {
        // Fetch sender's latest avatarUrl from DB
        const [senderRow] = await db
          .select({ avatarUrl: usersTable.avatarUrl })
          .from(usersTable)
          .where(eq(usersTable.id, user.id))
          .limit(1);

        const [msg] = await db
          .insert(messagesTable)
          .values({
            senderId: user.id,
            content: data.content.trim(),
            dmUserId: data.toUserId,
            groupId: null,
            createdAt: new Date().toISOString(),
          })
          .returning();

        const payload = {
          id: msg.id,
          content: msg.content,
          senderId: user.id,
          senderUsername: user.username,
          senderAvatarUrl: senderRow?.avatarUrl || null,
          createdAt: msg.createdAt,
          dmUserId: msg.dmUserId,
          groupId: null,
        };

        logger.info({ msgId: msg.id, to: data.toUserId }, "dm_message saved, broadcasting");
        socket.emit("dm_message", payload);
        io.to(`user_${data.toUserId}`).emit("dm_message", payload);
        // Notification with title + body so client can show desktop notification + play sound
        io.to(`user_${data.toUserId}`).emit("unread_update", {
          type: "dm",
          id: user.id,
          title: user.username,
          body: data.content.trim().slice(0, 100),
        });
      } catch (err) {
        logger.error({ err }, "dm_message DB error");
        socket.emit("message_error", { error: "Failed to send message" });
      }
    });

    socket.on("group_message", async (data: { groupId: number; content: string }) => {
      logger.info({ from: user.id, groupId: data.groupId }, "group_message received");
      if (!data.groupId || !data.content?.trim()) return;
      try {
        const memberRows = await db
          .select()
          .from(groupMembersTable)
          .where(eq(groupMembersTable.groupId, data.groupId));

        const isMember = memberRows.some((m) => m.userId === user.id);
        if (!isMember) {
          logger.warn({ userId: user.id, groupId: data.groupId }, "group_message: not a member");
          return;
        }

        // Look up group name for notification title
        const [groupRow] = await db
          .select({ name: groupsTable.name })
          .from(groupsTable)
          .where(eq(groupsTable.id, data.groupId))
          .limit(1);

        const [msg] = await db
          .insert(messagesTable)
          .values({
            senderId: user.id,
            content: data.content.trim(),
            dmUserId: null,
            groupId: data.groupId,
            createdAt: new Date().toISOString(),
          })
          .returning();

        // Look up sender's avatar
        const [senderRow] = await db
          .select({ avatarUrl: usersTable.avatarUrl })
          .from(usersTable)
          .where(eq(usersTable.id, user.id))
          .limit(1);

        const payload = {
          id: msg.id,
          content: msg.content,
          senderId: user.id,
          senderUsername: user.username,
          senderAvatarUrl: senderRow?.avatarUrl || null,
          createdAt: msg.createdAt,
          dmUserId: null,
          groupId: msg.groupId,
        };

        const groupName = groupRow?.name ?? "Group";
        logger.info({ msgId: msg.id, groupId: data.groupId, memberCount: memberRows.length }, "group_message saved, broadcasting");
        for (const member of memberRows) {
          io.to(`user_${member.userId}`).emit("group_message", payload);
          if (member.userId !== user.id) {
            io.to(`user_${member.userId}`).emit("unread_update", {
              type: "group",
              id: data.groupId,
              title: `#${groupName}`,
              body: `${user.username}: ${data.content.trim().slice(0, 90)}`,
            });
          }
        }
      } catch (err) {
        logger.error({ err }, "group_message DB error");
        socket.emit("message_error", { error: "Failed to send message" });
      }
    });

    socket.on("message_read", async (data: { type: "dm" | "group"; id: number }) => {
      const now = new Date().toISOString();
      try {
        if (data.type === "dm") {
          await db
            .insert(dmMetadataTable)
            .values({
              userId: user.id,
              otherUserId: data.id,
              lastReadAt: now,
            })
            .onConflictDoUpdate({
              target: [dmMetadataTable.userId, dmMetadataTable.otherUserId],
              set: { lastReadAt: now },
            });
        } else {
          await db
            .update(groupMembersTable)
            .set({ lastReadAt: now })
            .where(
              and(
                eq(groupMembersTable.groupId, data.id),
                eq(groupMembersTable.userId, user.id)
              )
            );
        }
        logger.info({ userId: user.id, type: data.type, id: data.id }, "Marked as read");
      } catch (err) {
        logger.error({ err }, "message_read DB error");
      }
    });

    // ─── CALL RINGING SYSTEM ──────────────────────────────────────────────────
    // (Unchanged — this is UI signaling, not media signaling)

    socket.on("call:invite", (data: { roomId: string; targetUserIds: number[] }) => {
      const { roomId, targetUserIds } = data;
      if (!roomId || !targetUserIds?.length) return;
      logger.info({ from: user.id, roomId, targetUserIds }, "call:invite emitted");
      for (const targetId of targetUserIds) {
        io.to(`user_${targetId}`).emit("incoming_call", {
          roomId,
          callerId: user.id,
          callerName: user.username,
        });
      }
    });

    socket.on("call:accept", (data: { roomId: string; callerId: number }) => {
      const { roomId, callerId } = data;
      logger.info({ from: user.id, roomId, callerId }, "call:accept");
      io.to(`user_${callerId}`).emit("call:accepted", {
        roomId,
        acceptedBy: user.id,
        acceptedByName: user.username,
      });
    });

    socket.on("call:decline", (data: { roomId: string; callerId: number }) => {
      const { roomId, callerId } = data;
      logger.info({ from: user.id, roomId, callerId }, "call:decline");
      io.to(`user_${callerId}`).emit("call:declined", {
        roomId,
        declinedBy: user.id,
        declinedByName: user.username,
      });
    });

    // ─── VOICE CHANNEL (SFU presence tracking) ───────────────────────────────
    // Media is handled by voice-server via REST.
    // Socket is used for: room join/leave presence + UI state events.

    socket.on("voice:join-room", async (data: { roomId: string; avatarUrl?: string | null }) => {
      const { roomId, avatarUrl } = data;
      if (!roomId) return;

      if (!voiceRooms.has(roomId)) {
        voiceRooms.set(roomId, new Map());
      }
      const peers = voiceRooms.get(roomId)!;

      // Fetch avatarUrl if not provided
      let resolvedAvatarUrl = avatarUrl || null;
      if (!resolvedAvatarUrl) {
        try {
          const [dbUser] = await db
            .select({ avatarUrl: usersTable.avatarUrl })
            .from(usersTable)
            .where(eq(usersTable.id, user.id))
            .limit(1);
          resolvedAvatarUrl = dbUser?.avatarUrl || null;
        } catch (e) {
          logger.error({ e }, "Error fetching avatarUrl for voice join");
        }
      }

      const peer: VoicePeer = {
        userId: user.id,
        username: user.username,
        avatarUrl: resolvedAvatarUrl,
        peerId: `user_${user.id}`,
      };

      // Join the socket room for this voice channel
      socket.join(`voice_${roomId}`);
      peers.set(socket.id, peer);

      // Send existing peers list back to the joiner
      const existingPeers = Array.from(peers.entries())
        .filter(([sid]) => sid !== socket.id)
        .map(([sid, p]) => ({ socketId: sid, ...p }));

      socket.emit("voice:room-peers", { roomId, peers: existingPeers });

      // Notify others that a new peer joined
      socket.to(`voice_${roomId}`).emit("voice:peer-joined", {
        socketId: socket.id,
        peerId: peer.peerId,
        userId: user.id,
        username: user.username,
        avatarUrl: resolvedAvatarUrl,
      });

      logger.info({ roomId, userId: user.id, peerId: peer.peerId }, "User joined voice room (socket)");
    });

    socket.on("voice:leave-room", (data: { roomId: string }) => {
      const { roomId } = data;
      if (!roomId) return;
      leaveVoiceRoom(socket, roomId, user);
    });

    // ─── UI STATE EVENTS (mute / deafen / speaking) ───────────────────────────
    // These are cheap socket events — no media processing.

    socket.on("speaking", ({ roomId, isSpeaking }: { roomId: string; isSpeaking: boolean }) => {
      socket.to(`voice_${roomId}`).emit("speaking", {
        socketId: socket.id,
        userId: user.id,
        isSpeaking,
      });
    });

    socket.on("mute_status", ({ roomId, isMuted }: { roomId: string; isMuted: boolean }) => {
      socket.to(`voice_${roomId}`).emit("mute_status", {
        socketId: socket.id,
        userId: user.id,
        isMuted,
      });
    });

    socket.on("deafen_status", ({ roomId, isDeafened }: { roomId: string; isDeafened: boolean }) => {
      socket.to(`voice_${roomId}`).emit("deafen_status", {
        socketId: socket.id,
        userId: user.id,
        isDeafened,
      });
    });

    // ── Video presence state (UI indicator — media uses voice:producer-new) ────
    socket.on("video_status", ({ roomId, isVideoOn }: { roomId: string; isVideoOn: boolean }) => {
      socket.to(`voice_${roomId}`).emit("video_status", {
        socketId: socket.id,
        userId: user.id,
        isVideoOn,
      });
    });

    socket.on("screenshare_status", ({ roomId, isScreenSharing }: { roomId: string; isScreenSharing: boolean }) => {
      socket.to(`voice_${roomId}`).emit("screenshare_status", {
        socketId: socket.id,
        userId: user.id,
        isScreenSharing,
      });
    });
  });

  // ─── Helper: leave a voice room ─────────────────────────────────────────────
  function leaveVoiceRoom(
    socket: any,
    roomId: string,
    user: { id: number; username: string }
  ) {
    const peers = voiceRooms.get(roomId);
    if (!peers) return;

    peers.delete(socket.id);
    socket.leave(`voice_${roomId}`);

    if (peers.size === 0) {
      voiceRooms.delete(roomId);
    }

    logger.info({ roomId, userId: user.id }, "User left voice room (socket)");

    io.to(`voice_${roomId}`).emit("voice:peer-left", {
      socketId: socket.id,
      peerId: `user_${user.id}`,
      userId: user.id,
      username: user.username,
    });
  }

  return io;
}
