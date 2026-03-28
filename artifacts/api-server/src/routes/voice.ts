import { Router } from "express";
import { verifyToken } from "../lib/auth.js";
import { logger } from "../lib/logger.js";

const router = Router();

// ─── Internal voice-server base URL ──────────────────────────────────────────
const VOICE_SERVER_URL =
  process.env.VOICE_SERVER_URL || "http://localhost:5002";
const INTERNAL_SECRET =
  process.env.VOICE_INTERNAL_SECRET || "bobacord_internal_secret_dev_only";

/** Proxy a POST request to the voice-server internal API */
async function voiceProxy(path: string, body: object): Promise<any> {
  const url = `${VOICE_SERVER_URL}/internal${path}`;
  logger.info({ url }, "[voice-proxy] request");

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-internal-secret": INTERNAL_SECRET,
    },
    body: JSON.stringify(body),
  });

  const data = (await res.json()) as any;
  if (!res.ok) throw new Error(data.error || `Voice server error: ${res.status}`);
  return data;
}

/** Proxy a GET request to the voice-server internal API */
async function voiceGet(path: string): Promise<any> {
  const url = `${VOICE_SERVER_URL}/internal${path}`;
  const res = await fetch(url, {
    headers: { "x-internal-secret": INTERNAL_SECRET },
  });
  const data = (await res.json()) as any;
  if (!res.ok) throw new Error(data.error || `Voice server error: ${res.status}`);
  return data;
}

// ─── Auth middleware ──────────────────────────────────────────────────────────
router.use((req, res, next) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ")
    ? authHeader.slice(7)
    : null;

  if (!token) {
    res.status(401).json({ error: "No token" });
    return;
  }

  try {
    (req as any).user = verifyToken(token);
    next();
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
});

// ─── POST /api/voice/join ─────────────────────────────────────────────────────
// Join a voice channel — get transport params + router RTP capabilities.
router.post("/join", async (req, res) => {
  const user = (req as any).user as { id: number; username: string };
  const { roomId, avatarUrl } = req.body as {
    roomId: string;
    avatarUrl?: string | null;
  };

  if (!roomId) {
    res.status(400).json({ error: "roomId is required" });
    return;
  }

  const peerId = `user_${user.id}`;

  try {
    const data = await voiceProxy("/join", {
      roomId,
      peerId,
      userId: user.id,
      username: user.username,
      avatarUrl: avatarUrl || null,
    });

    logger.info({ roomId, userId: user.id, peerId }, "[voice] join — transports created");
    res.json({ peerId, ...data });
  } catch (err: any) {
    logger.error({ err }, "[voice] join error");
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/voice/connect-transport ───────────────────────────────────────
router.post("/connect-transport", async (req, res) => {
  const user = (req as any).user as { id: number };
  const { roomId, transportId, dtlsParameters } = req.body;

  if (!roomId || !transportId || !dtlsParameters) {
    res.status(400).json({ error: "Missing required fields" });
    return;
  }

  try {
    const data = await voiceProxy("/connect-transport", {
      roomId,
      peerId: `user_${user.id}`,
      transportId,
      dtlsParameters,
    });
    res.json(data);
  } catch (err: any) {
    logger.error({ err }, "[voice] connect-transport error");
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/voice/produce ──────────────────────────────────────────────────
// Client starts producing a track (audio, camera, or screen share).
// Returns producerId. Broadcasts voice:producer-new to the room with kind + streamType.
router.post("/produce", async (req, res) => {
  const user = (req as any).user as { id: number; username: string };
  const { roomId, kind, rtpParameters, appData, avatarUrl } = req.body as {
    roomId: string;
    kind: "audio" | "video";
    rtpParameters: any;
    appData?: { streamType?: string };
    avatarUrl?: string | null;
  };

  if (!roomId || !kind || !rtpParameters) {
    res.status(400).json({ error: "Missing required fields" });
    return;
  }

  const streamType = appData?.streamType || (kind === "audio" ? "audio" : "camera");

  try {
    const data = await voiceProxy("/produce", {
      roomId,
      peerId: `user_${user.id}`,
      kind,
      rtpParameters,
      appData: { streamType },
    });

    logger.info(
      { roomId, userId: user.id, producerId: data.producerId, kind, streamType },
      "[voice] produced"
    );

    // Notify all peers in the room so they create consumers
    const io = req.app.get("io");
    if (io) {
      io.to(`voice_${roomId}`).emit("voice:producer-new", {
        peerId: `user_${user.id}`,
        producerId: data.producerId,
        kind,
        streamType,
        userId: user.id,
        username: user.username,
        avatarUrl: avatarUrl || null,
      });
    }

    res.json(data);
  } catch (err: any) {
    logger.error({ err }, "[voice] produce error");
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/voice/stop-produce ────────────────────────────────────────────
// Close a specific producer (turn off camera or end screen share) while keeping
// the peer in the room. Broadcasts voice:producer-closed with the producerId.
router.post("/stop-produce", async (req, res) => {
  const user = (req as any).user as { id: number; username: string };
  const { roomId, producerId } = req.body as {
    roomId: string;
    producerId: string;
  };

  if (!roomId || !producerId) {
    res.status(400).json({ error: "Missing required fields" });
    return;
  }

  try {
    const data = await voiceProxy("/stop-produce", {
      roomId,
      peerId: `user_${user.id}`,
      producerId,
    });

    logger.info(
      { roomId, userId: user.id, producerId, streamType: data.streamType },
      "[voice] stop-produce"
    );

    // Notify room members that this specific producer is gone
    const io = req.app.get("io");
    if (io) {
      io.to(`voice_${roomId}`).emit("voice:producer-closed", {
        peerId: `user_${user.id}`,
        producerId,
        streamType: data.streamType,
        userId: user.id,
        username: user.username,
      });
    }

    res.json({ stopped: true });
  } catch (err: any) {
    logger.error({ err }, "[voice] stop-produce error");
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/voice/consume ──────────────────────────────────────────────────
// Client requests to consume a specific producerId.
router.post("/consume", async (req, res) => {
  const user = (req as any).user as { id: number };
  const { roomId, producerId, rtpCapabilities } = req.body as {
    roomId: string;
    producerId: string;
    rtpCapabilities: any;
  };

  if (!roomId || !producerId || !rtpCapabilities) {
    res.status(400).json({ error: "Missing required fields" });
    return;
  }

  try {
    const data = await voiceProxy("/consume", {
      roomId,
      consumerPeerId: `user_${user.id}`,
      producerId,
      rtpCapabilities,
    });
    res.json(data);
  } catch (err: any) {
    logger.error({ err }, "[voice] consume error");
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/voice/leave ────────────────────────────────────────────────────
router.post("/leave", async (req, res) => {
  const user = (req as any).user as { id: number; username: string };
  const { roomId } = req.body as { roomId: string };

  if (!roomId) {
    res.status(400).json({ error: "roomId is required" });
    return;
  }

  const peerId = `user_${user.id}`;

  try {
    await voiceProxy("/leave", { roomId, peerId });

    // Notify room members via socket.io
    const io = req.app.get("io");
    if (io) {
      io.to(`voice_${roomId}`).emit("voice:peer-left", {
        peerId,
        userId: user.id,
        username: user.username,
      });
    }

    res.json({ left: true });
  } catch (err: any) {
    logger.error({ err }, "[voice] leave error");
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /api/voice/room/:roomId/peers ───────────────────────────────────────
router.get("/room/:roomId/peers", async (req, res) => {
  const { roomId } = req.params;
  try {
    const data = await voiceGet(`/room/${roomId}/peers`);
    res.json(data);
  } catch (err: any) {
    logger.error({ err }, "[voice] get peers error");
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /api/voice/restart-ice ─────────────────────────────────────────────
router.post("/restart-ice", async (req, res) => {
  const user = (req as any).user as { id: number };
  const { roomId, transportId } = req.body;

  if (!roomId || !transportId) {
    res.status(400).json({ error: "Missing required fields" });
    return;
  }

  try {
    const data = await voiceProxy("/restart-ice", {
      roomId,
      peerId: `user_${user.id}`,
      transportId,
    });
    res.json(data);
  } catch (err: any) {
    logger.error({ err }, "[voice] restart-ice error");
    res.status(500).json({ error: err.message });
  }
});

export default router;
