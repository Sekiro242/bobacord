import { Router } from "express";
import { db } from "@workspace/db";
import { friendRequestsTable, usersTable, messagesTable, dmMetadataTable } from "@workspace/db/schema";
import { eq, or, and, gt, count } from "drizzle-orm";
import { requireAuth, AuthRequest } from "../lib/auth.js";

const router = Router();

router.get("/", requireAuth, async (req: AuthRequest, res) => {
  const userId = req.user!.id;
  try {
    const accepted = await db
      .select()
      .from(friendRequestsTable)
      .where(
        and(
          or(
            eq(friendRequestsTable.senderId, userId),
            eq(friendRequestsTable.receiverId, userId)
          ),
          eq(friendRequestsTable.status, "accepted")
        )
      );

    const friendIds = accepted.map((r) =>
      r.senderId === userId ? r.receiverId : r.senderId
    );

    if (friendIds.length === 0) {
      res.json([]);
      return;
    }

    const friends = await Promise.all(
      friendIds.map(async (fid) => {
        const [user] = await db
          .select({ id: usersTable.id, username: usersTable.username, avatarUrl: usersTable.avatarUrl })
          .from(usersTable)
          .where(eq(usersTable.id, fid))
          .limit(1);

        if (!user) return null;

        // Fetch last read at
        const [meta] = await db
          .select({ lastReadAt: dmMetadataTable.lastReadAt })
          .from(dmMetadataTable)
          .where(and(eq(dmMetadataTable.userId, userId), eq(dmMetadataTable.otherUserId, fid)))
          .limit(1);

        const lastRead = meta?.lastReadAt || "1970-01-01T00:00:00.000Z";

        // Count unread messages
        const [unread] = await db
          .select({ count: count() })
          .from(messagesTable)
          .where(
            and(
              eq(messagesTable.senderId, fid),
              eq(messagesTable.dmUserId, userId),
              gt(messagesTable.createdAt, lastRead)
            )
          );

        return { ...user, unreadCount: unread?.count || 0 };
      })
    );

    res.json(friends.filter(Boolean));
  } catch (err) {
    req.log.error({ err }, "Get friends error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/requests", requireAuth, async (req: AuthRequest, res) => {
  const userId = req.user!.id;
  try {
    const requests = await db
      .select()
      .from(friendRequestsTable)
      .where(
        and(
          or(
            eq(friendRequestsTable.receiverId, userId),
            eq(friendRequestsTable.senderId, userId)
          ),
          eq(friendRequestsTable.status, "pending")
        )
      );

    const withSenders = await Promise.all(
      requests.map(async (r) => {
        const [sender] = await db
          .select({ id: usersTable.id, username: usersTable.username, avatarUrl: usersTable.avatarUrl })
          .from(usersTable)
          .where(eq(usersTable.id, r.senderId))
          .limit(1);
        const [receiver] = await db
          .select({ id: usersTable.id, username: usersTable.username, avatarUrl: usersTable.avatarUrl })
          .from(usersTable)
          .where(eq(usersTable.id, r.receiverId))
          .limit(1);
        return { ...r, sender, receiver };
      })
    );

    res.json(withSenders);
  } catch (err) {
    req.log.error({ err }, "Get friend requests error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/request", requireAuth, async (req: AuthRequest, res) => {
  const senderId = req.user!.id;
  const { receiverId } = req.body;
  if (!receiverId || receiverId === senderId) {
    res.status(400).json({ error: "Invalid receiver" });
    return;
  }
  try {
    const existing = await db
      .select()
      .from(friendRequestsTable)
      .where(
        or(
          and(
            eq(friendRequestsTable.senderId, senderId),
            eq(friendRequestsTable.receiverId, receiverId)
          ),
          and(
            eq(friendRequestsTable.senderId, receiverId),
            eq(friendRequestsTable.receiverId, senderId)
          )
        )
      )
      .limit(1);

    if (existing.length > 0) {
      res.status(400).json({ error: "Friend request already exists" });
      return;
    }

    const [request] = await db
      .insert(friendRequestsTable)
      .values({ senderId, receiverId, status: "pending", createdAt: new Date().toISOString() })
      .returning();

    const [sender] = await db
      .select({ id: usersTable.id, username: usersTable.username, avatarUrl: usersTable.avatarUrl })
      .from(usersTable)
      .where(eq(usersTable.id, senderId))
      .limit(1);
    const [receiver] = await db
      .select({ id: usersTable.id, username: usersTable.username, avatarUrl: usersTable.avatarUrl })
      .from(usersTable)
      .where(eq(usersTable.id, receiverId))
      .limit(1);

    const io = req.app.get("io");
    if (io) {
      io.to(`user_${receiverId}`).emit("friend_request_received", { ...request, sender, receiver });
      io.to(`user_${senderId}`).emit("friend_request_sent", { ...request, sender, receiver });
    }

    res.json({ ...request, sender, receiver });
  } catch (err) {
    req.log.error({ err }, "Send friend request error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/accept", requireAuth, async (req: AuthRequest, res) => {
  const userId = req.user!.id;
  const { requestId } = req.body;
  if (!requestId) {
    res.status(400).json({ error: "requestId required" });
    return;
  }
  try {
    const [request] = await db
      .select()
      .from(friendRequestsTable)
      .where(eq(friendRequestsTable.id, requestId))
      .limit(1);

    if (!request || request.receiverId !== userId) {
      res.status(400).json({ error: "Request not found or not authorized" });
      return;
    }

    await db
      .update(friendRequestsTable)
      .set({ status: "accepted" })
      .where(eq(friendRequestsTable.id, requestId));

    const io = req.app.get("io");
    if (io) {
      io.to(`user_${request.senderId}`).emit("friend_request_accepted", { requestId });
      io.to(`user_${request.receiverId}`).emit("friend_request_accepted", { requestId });
    }

    res.json({ success: true });
  } catch (err) {
    req.log.error({ err }, "Accept friend request error");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
