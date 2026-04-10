import { Router } from "express";
import { db } from "@workspace/db";
import { groupsTable, groupMembersTable, messagesTable, usersTable } from "@workspace/db/schema";
import { eq, asc, and, gt, count } from "drizzle-orm";
import { requireAuth, AuthRequest } from "../lib/auth.js";

const router = Router();

router.get("/", requireAuth, async (req: AuthRequest, res) => {
  const userId = req.user!.id;
  try {
    const memberships = await db
      .select({ groupId: groupMembersTable.groupId })
      .from(groupMembersTable)
      .where(eq(groupMembersTable.userId, userId));

    if (memberships.length === 0) {
      res.json([]);
      return;
    }

    const groups = await Promise.all(
      memberships.map(async ({ groupId }) => {
        const [group] = await db
          .select()
          .from(groupsTable)
          .where(eq(groupsTable.id, groupId))
          .limit(1);

        if (!group) return null;

        const [memberInfo] = await db
          .select({ lastReadAt: groupMembersTable.lastReadAt })
          .from(groupMembersTable)
          .where(and(eq(groupMembersTable.groupId, groupId), eq(groupMembersTable.userId, userId)))
          .limit(1);

        const lastRead = memberInfo?.lastReadAt || "1970-01-01T00:00:00.000Z";

        const [unread] = await db
          .select({ count: count() })
          .from(messagesTable)
          .where(
            and(
              eq(messagesTable.groupId, groupId),
              gt(messagesTable.createdAt, lastRead)
            )
          );

        const memberRows = await db
          .select({
            id: usersTable.id,
            username: usersTable.username,
            avatarUrl: usersTable.avatarUrl
          })
          .from(groupMembersTable)
          .innerJoin(usersTable, eq(groupMembersTable.userId, usersTable.id))
          .where(eq(groupMembersTable.groupId, groupId));

        return { ...group, members: memberRows, unreadCount: unread?.count || 0 };
      })
    );

    res.json(groups.filter(Boolean));
  } catch (err) {
    req.log.error({ err }, "Get groups error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/", requireAuth, async (req: AuthRequest, res) => {
  const userId = req.user!.id;
  const { name, memberIds } = req.body;
  if (!name || !Array.isArray(memberIds)) {
    res.status(400).json({ error: "name and memberIds required" });
    return;
  }
  const allMembers = Array.from(new Set([userId, ...memberIds]));
  if (allMembers.length > 10) {
    res.status(400).json({ error: "Max 10 members per group" });
    return;
  }
  try {
    const [group] = await db
      .insert(groupsTable)
      .values({ name, createdById: userId, createdAt: new Date().toISOString() })
      .returning();

    await db.insert(groupMembersTable).values(
      allMembers.map((uid) => ({ 
        groupId: group.id, 
        userId: uid, 
        lastReadAt: new Date().toISOString() 
      }))
    );

    const memberRows = await db
      .select({
        id: usersTable.id,
        username: usersTable.username,
        avatarUrl: usersTable.avatarUrl
      })
      .from(groupMembersTable)
      .innerJoin(usersTable, eq(groupMembersTable.userId, usersTable.id))
      .where(eq(groupMembersTable.groupId, group.id));

    const io = req.app.get("io");
    if (io) {
      for (const member of memberRows) {
        io.to(`user_${member.id}`).emit("group_created", { ...group, members: memberRows });
      }
    }

    res.json({ ...group, members: memberRows });
  } catch (err) {
    req.log.error({ err }, "Create group error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/:groupId/messages", requireAuth, async (req: AuthRequest, res) => {
  const userId = req.user!.id;
  const groupId = parseInt(req.params.groupId as string);
  if (isNaN(groupId)) {
    res.status(400).json({ error: "Invalid groupId" });
    return;
  }
  try {
    const [membership] = await db
      .select()
      .from(groupMembersTable)
      .where(
        eq(groupMembersTable.groupId, groupId)
      )
      .limit(100);

    const memberRows = await db
      .select()
      .from(groupMembersTable)
      .where(eq(groupMembersTable.groupId, groupId));

    const isMember = memberRows.some((m) => m.userId === userId);
    if (!isMember) {
      res.status(403).json({ error: "Not a member" });
      return;
    }

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
      .where(eq(messagesTable.groupId, groupId))
      .orderBy(asc(messagesTable.createdAt))
      .limit(200);

    res.json(messages);
  } catch (err) {
    req.log.error({ err }, "Get group messages error");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
