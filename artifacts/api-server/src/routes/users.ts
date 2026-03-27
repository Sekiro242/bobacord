import { Router } from "express";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db/schema";
import { like, eq } from "drizzle-orm";
import { requireAuth, AuthRequest } from "../lib/auth.js";

const router = Router();

router.get("/search", requireAuth, async (req: AuthRequest, res) => {
  const q = req.query.q as string;
  if (!q || q.trim().length === 0) {
    res.json([]);
    return;
  }
  try {
    const users = await db
      .select({
        id: usersTable.id,
        username: usersTable.username,
        avatarUrl: usersTable.avatarUrl
      })
      .from(usersTable)
      .where(like(usersTable.username, `%${q.trim()}%`))
      .limit(20);
    res.json(users.filter((u) => u.id !== req.user!.id));
  } catch (err) {
    req.log.error({ err }, "Search error");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.patch("/profile", requireAuth, async (req: AuthRequest, res) => {
  const { username, avatarUrl } = req.body;

  try {
    const updateData: any = {};
    if (username !== undefined) updateData.username = username;
    if (avatarUrl !== undefined) updateData.avatarUrl = avatarUrl;

    if (Object.keys(updateData).length === 0) {
      res.status(400).json({ error: "No update data provided" });
      return;
    }

    const [updatedUser] = await db
      .update(usersTable)
      .set(updateData)
      .where(eq(usersTable.id, req.user!.id))
      .returning({
        id: usersTable.id,
        username: usersTable.username,
        avatarUrl: usersTable.avatarUrl
      });

    res.json(updatedUser);
  } catch (err) {
    req.log.error({ err }, "Profile update error");
    res.status(500).json({ error: "Internal server error" });
  }
});

import multer from "multer";
import path from "path";
import fs from "fs";

const uploadDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: uploadDir,
  filename: (req, _file, cb) => {
    cb(null, `${(req as AuthRequest).user!.id}-${Date.now()}${path.extname(_file.originalname)}`);
  }
});
const upload = multer({ storage });

router.post("/avatar", requireAuth, upload.single("avatar"), async (req: AuthRequest, res) => {
  if (!req.file) {
    res.status(400).json({ error: "No file uploaded" });
    return;
  }
  
  const avatarUrl = `/uploads/${req.file.filename}`;
  
  try {
    const [updatedUser] = await db
      .update(usersTable)
      .set({ avatarUrl })
      .where(eq(usersTable.id, req.user!.id))
      .returning({
        id: usersTable.id,
        username: usersTable.username,
        avatarUrl: usersTable.avatarUrl
      });
      
    res.json(updatedUser);
  } catch (err) {
    req.log.error({ err }, "Avatar upload error");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
