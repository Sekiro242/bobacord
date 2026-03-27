import { Router } from "express";
import { db } from "@workspace/db";
import { messagesTable, usersTable } from "@workspace/db/schema";
import { eq, or, and, asc } from "drizzle-orm";
import { requireAuth, AuthRequest } from "../lib/auth.js";

const router = Router();

router.get("/dm/:userId", requireAuth, async (req: AuthRequest, res) => {
  const myId = req.user!.id;
  const otherId = parseInt(req.params.userId);
  if (isNaN(otherId)) {
    res.status(400).json({ error: "Invalid userId" });
    return;
  }
  try {
    const messages = await db
      .select({
        id: messagesTable.id,
        content: messagesTable.content,
        senderId: messagesTable.senderId,
        senderUsername: usersTable.username,
        senderAvatarUrl: usersTable.avatarUrl,
        createdAt: messagesTable.createdAt,
        dmUserId: messagesTable.dmUserId,
        groupId: messagesTable.groupId,
      })
      .from(messagesTable)
      .innerJoin(usersTable, eq(messagesTable.senderId, usersTable.id))
      .where(
        or(
          and(
            eq(messagesTable.senderId, myId),
            eq(messagesTable.dmUserId, otherId)
          ),
          and(
            eq(messagesTable.senderId, otherId),
            eq(messagesTable.dmUserId, myId)
          )
        )
      )
      .orderBy(asc(messagesTable.createdAt))
      .limit(200);

    res.json(messages);
  } catch (err) {
    req.log.error({ err }, "Get DM messages error");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
