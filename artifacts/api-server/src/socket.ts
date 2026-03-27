import { Server as SocketServer } from "socket.io";
import { Server as HttpServer } from "http";
import { verifyToken } from "./lib/auth.js";
import { db } from "@workspace/db";
import { messagesTable, groupMembersTable, usersTable } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { logger } from "./lib/logger.js";

interface CallRoom {
  users: Map<string, { userId: number; username: string; avatarUrl?: string | null }>;
}

const callRooms = new Map<string, CallRoom>();

export function setupSocket(httpServer: HttpServer) {
  const io = new SocketServer(httpServer, {
    cors: { origin: "*" },
    path: "/socket.io",
    // Allow both polling and websocket so it works behind all proxies
    transports: ["polling", "websocket"],
  });

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

    // Each user joins their own room for targeted messages
    socket.join(`user_${user.id}`);

    socket.on("disconnect", (reason) => {
      logger.info({ userId: user.id, socketId: socket.id, reason }, "Socket disconnected");
      for (const [roomId, room] of callRooms.entries()) {
        if (room.users.has(socket.id)) {
          leaveCall(socket, roomId, user);
        }
      }
    });

    // ─── MESSAGING ────────────────────────────────────────────────────────────

    socket.on("dm_message", async (data: { toUserId: number; content: string }) => {
      logger.info({ from: user.id, to: data.toUserId }, "dm_message received");
      if (!data.toUserId || !data.content?.trim()) return;
      try {
        const [msg] = await db
          .insert(messagesTable)
          .values({
            senderId: user.id,
            content: data.content.trim(),
            dmUserId: data.toUserId,
            groupId: null,
          })
          .returning();

        const payload = {
          id: msg.id,
          content: msg.content,
          senderId: user.id,
          senderUsername: user.username,
          senderAvatarUrl: (user as any).avatarUrl || null,
          createdAt: msg.createdAt,
          dmUserId: msg.dmUserId,
          groupId: null,
        };

        logger.info({ msgId: msg.id, to: data.toUserId }, "dm_message saved, broadcasting");
        // Send to sender (confirming send) and to receiver
        socket.emit("dm_message", payload);
        io.to(`user_${data.toUserId}`).emit("dm_message", payload);
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

        const [msg] = await db
          .insert(messagesTable)
          .values({
            senderId: user.id,
            content: data.content.trim(),
            dmUserId: null,
            groupId: data.groupId,
          })
          .returning();

        const payload = {
          id: msg.id,
          content: msg.content,
          senderId: user.id,
          senderUsername: user.username,
          senderAvatarUrl: (user as any).avatarUrl || null,
          createdAt: msg.createdAt,
          dmUserId: null,
          groupId: msg.groupId,
        };

        logger.info({ msgId: msg.id, groupId: data.groupId, memberCount: memberRows.length }, "group_message saved, broadcasting");
        for (const member of memberRows) {
          io.to(`user_${member.userId}`).emit("group_message", payload);
        }
      } catch (err) {
        logger.error({ err }, "group_message DB error");
        socket.emit("message_error", { error: "Failed to send message" });
      }
    });

    // ─── CALL RINGING SYSTEM ──────────────────────────────────────────────────

    // Caller invites someone to a call before joining
    // data: { roomId, targetUserIds: number[] }
    socket.on("call:invite", (data: { roomId: string; targetUserIds: number[] }) => {
      const { roomId, targetUserIds } = data;
      if (!roomId || !targetUserIds?.length) return;

      logger.info({ from: user.id, roomId, targetUserIds }, "call:invite emitted");

      // Notify each target user of the incoming call
      for (const targetId of targetUserIds) {
        io.to(`user_${targetId}`).emit("incoming_call", {
          roomId,
          callerId: user.id,
          callerName: user.username,
        });
        logger.info({ targetId, roomId }, "incoming_call sent");
      }
    });

    // Target accepts the call
    // data: { roomId, callerId: number }
    socket.on("call:accept", (data: { roomId: string; callerId: number }) => {
      const { roomId, callerId } = data;
      logger.info({ from: user.id, roomId, callerId }, "call:accept");
      // Notify the caller that this user accepted
      io.to(`user_${callerId}`).emit("call:accepted", {
        roomId,
        acceptedBy: user.id,
        acceptedByName: user.username,
      });
    });

    // Target declines the call
    // data: { roomId, callerId: number }
    socket.on("call:decline", (data: { roomId: string; callerId: number }) => {
      const { roomId, callerId } = data;
      logger.info({ from: user.id, roomId, callerId }, "call:decline");
      io.to(`user_${callerId}`).emit("call:declined", {
        roomId,
        declinedBy: user.id,
        declinedByName: user.username,
      });
    });

    // ─── VOICE CALL (WebRTC SIGNALING) ────────────────────────────────────────

    socket.on("join_call", async (data: { roomId: string }) => {
      const { roomId } = data;
      if (!roomId) return;

      if (!callRooms.has(roomId)) {
        callRooms.set(roomId, { users: new Map() });
      }
      const room = callRooms.get(roomId)!;

      if (room.users.size >= 10) {
        logger.warn({ roomId, userId: user.id }, "join_call: room full");
        socket.emit("call_full", { roomId });
        return;
      }

      // Fetch avatar URL from DB since it's not in the JWT
      let avatarUrl: string | null = null;
      try {
        const [dbUser] = await db.select({ avatarUrl: usersTable.avatarUrl }).from(usersTable).where(eq(usersTable.id, user.id)).limit(1);
        avatarUrl = dbUser?.avatarUrl || null;
      } catch (e) {
        logger.error({ e }, "Error fetching avatarUrl for call");
      }

      const existingUsers = Array.from(room.users.entries()).map(([sid, u]) => ({
        socketId: sid,
        userId: u.userId,
        username: u.username,
        avatarUrl: u.avatarUrl,
      }));

      room.users.set(socket.id, { userId: user.id, username: user.username, avatarUrl });
      socket.join(roomId);

      logger.info({ roomId, userId: user.id, existingCount: existingUsers.length }, "join_call: joined");
      socket.emit("room_users", { roomId, users: existingUsers });

      // Tell others someone joined
      socket.to(roomId).emit("user_joined_call", {
        socketId: socket.id,
        userId: user.id,
        username: user.username,
        avatarUrl,
      });
    });

    socket.on("leave_call", (data: { roomId: string }) => {
      const { roomId } = data;
      if (!roomId) return;
      leaveCall(socket, roomId, user);
    });

    // WebRTC signaling – relay offer/answer/ICE by socket ID (not user ID)
    socket.on("webrtc_offer", (data: { to: string; offer: any; avatarUrl?: string | null }) => {
      logger.info({ from: socket.id, to: data.to }, "webrtc_offer relaying");
      io.to(data.to).emit("webrtc_offer", {
        from: socket.id,
        fromUserId: user.id,
        fromUsername: user.username,
        fromAvatarUrl: data.avatarUrl || null,
        offer: data.offer,
      });
    });

    socket.on("webrtc_answer", (data: { to: string; answer: any }) => {
      logger.info({ from: socket.id, to: data.to }, "webrtc_answer relaying");
      io.to(data.to).emit("webrtc_answer", {
        from: socket.id,
        answer: data.answer,
      });
    });

    socket.on("webrtc_ice", ({ to, candidate }) => {
      socket.to(to).emit("webrtc_ice", { from: socket.id, candidate });
    });

    socket.on("speaking", ({ roomId, isSpeaking }) => {
      socket.to(roomId).emit("speaking", { socketId: socket.id, userId: user.id, isSpeaking });
    });

    socket.on("mute_status", ({ roomId, isMuted }) => {
      socket.to(roomId).emit("mute_status", { socketId: socket.id, userId: user.id, isMuted });
    });

    socket.on("deafen_status", ({ roomId, isDeafened }) => {
      socket.to(roomId).emit("deafen_status", { socketId: socket.id, userId: user.id, isDeafened });
    });
  });

  function leaveCall(socket: any, roomId: string, user: { id: number; username: string }) {
    const room = callRooms.get(roomId);
    if (!room) return;
    room.users.delete(socket.id);
    socket.leave(roomId);
    if (room.users.size === 0) {
      callRooms.delete(roomId);
    }
    logger.info({ roomId, userId: user.id }, "leave_call");
    io.to(roomId).emit("user_left_call", {
      socketId: socket.id,
      userId: user.id,
      username: user.username,
    });
  }

  return io;
}
