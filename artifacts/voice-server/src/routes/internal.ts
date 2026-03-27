import { Router } from "express";
import { roomManager } from "../room-manager.js";
import { logger } from "../logger.js";

const router = Router();

// ─── Auth middleware (internal secret) ────────────────────────────────────────
router.use((req, res, next) => {
  const secret = req.headers["x-internal-secret"];
  if (secret !== process.env.INTERNAL_SECRET) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
});

// ─── POST /internal/join ──────────────────────────────────────────────────────
// Called when a user joins a voice channel.
// Creates Router (if needed), and two WebRTC transports (send + recv).
// Returns: routerRtpCapabilities + both transport params.
router.post("/join", async (req, res) => {
  const { roomId, peerId, userId, username, avatarUrl } = req.body as {
    roomId: string;
    peerId: string;
    userId: number;
    username: string;
    avatarUrl?: string | null;
  };

  if (!roomId || !peerId || !userId || !username) {
    res.status(400).json({ error: "Missing required fields" });
    return;
  }

  try {
    logger.info({ roomId, peerId, username }, "[internal] join");

    const { room } = await roomManager.addPeer(roomId, peerId, userId, username, avatarUrl);

    const [sendTransport, recvTransport] = await Promise.all([
      roomManager.createSendTransport(roomId, peerId),
      roomManager.createRecvTransport(roomId, peerId),
    ]);

    // Existing producers the new peer should consume
    const existingProducers = roomManager.getExistingProducers(roomId, peerId);

    res.json({
      routerRtpCapabilities: room.router.rtpCapabilities,
      sendTransportOptions: {
        id: sendTransport.id,
        iceParameters: sendTransport.iceParameters,
        iceCandidates: sendTransport.iceCandidates,
        dtlsParameters: sendTransport.dtlsParameters,
      },
      recvTransportOptions: {
        id: recvTransport.id,
        iceParameters: recvTransport.iceParameters,
        iceCandidates: recvTransport.iceCandidates,
        dtlsParameters: recvTransport.dtlsParameters,
      },
      existingProducers,
    });
  } catch (err: any) {
    logger.error({ err }, "[internal] join error");
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /internal/connect-transport ─────────────────────────────────────────
// Client finalises DTLS handshake for a transport.
router.post("/connect-transport", async (req, res) => {
  const { roomId, peerId, transportId, dtlsParameters } = req.body;

  if (!roomId || !peerId || !transportId || !dtlsParameters) {
    res.status(400).json({ error: "Missing required fields" });
    return;
  }

  try {
    logger.info({ roomId, peerId, transportId }, "[internal] connect-transport");
    await roomManager.connectTransport(roomId, peerId, transportId, dtlsParameters);
    res.json({ connected: true });
  } catch (err: any) {
    logger.error({ err }, "[internal] connect-transport error");
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /internal/produce ───────────────────────────────────────────────────
// Client begins sending audio — server creates a Producer.
// Returns producerId, which is broadcast to others so they can consume.
router.post("/produce", async (req, res) => {
  const { roomId, peerId, kind, rtpParameters } = req.body as {
    roomId: string;
    peerId: string;
    kind: "audio" | "video";
    rtpParameters: any;
  };

  if (!roomId || !peerId || !kind || !rtpParameters) {
    res.status(400).json({ error: "Missing required fields" });
    return;
  }

  try {
    logger.info({ roomId, peerId, kind }, "[internal] produce");
    const producer = await roomManager.produce(roomId, peerId, kind, rtpParameters);
    res.json({ producerId: producer.id });
  } catch (err: any) {
    logger.error({ err }, "[internal] produce error");
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /internal/consume ───────────────────────────────────────────────────
// Request to consume another peer's producer.
// Returns consumer parameters the client needs to receive the stream.
router.post("/consume", async (req, res) => {
  const { roomId, consumerPeerId, producerPeerId, rtpCapabilities } = req.body as {
    roomId: string;
    consumerPeerId: string;
    producerPeerId: string;
    rtpCapabilities: any;
  };

  if (!roomId || !consumerPeerId || !producerPeerId || !rtpCapabilities) {
    res.status(400).json({ error: "Missing required fields" });
    return;
  }

  try {
    logger.info({ roomId, consumerPeerId, producerPeerId }, "[internal] consume");
    const { consumer, producerInfo } = await roomManager.consume(
      roomId,
      consumerPeerId,
      producerPeerId,
      rtpCapabilities
    );

    res.json({
      consumerId: consumer.id,
      producerId: consumer.producerId,
      kind: consumer.kind,
      rtpParameters: consumer.rtpParameters,
      producerPeerId,
      producerUserId: producerInfo.userId,
      producerUsername: producerInfo.username,
      producerAvatarUrl: producerInfo.avatarUrl,
    });
  } catch (err: any) {
    logger.error({ err }, "[internal] consume error");
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /internal/leave ─────────────────────────────────────────────────────
// Peer is leaving the voice channel — close all their transports/producers.
router.post("/leave", (req, res) => {
  const { roomId, peerId } = req.body as { roomId: string; peerId: string };

  if (!roomId || !peerId) {
    res.status(400).json({ error: "Missing required fields" });
    return;
  }

  try {
    logger.info({ roomId, peerId }, "[internal] leave");
    roomManager.removePeer(roomId, peerId);
    res.json({ left: true });
  } catch (err: any) {
    logger.error({ err }, "[internal] leave error");
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /internal/room/:roomId/peers ─────────────────────────────────────────
// Get all active peers in a room (for api-server to broadcast to clients).
router.get("/room/:roomId/peers", (req, res) => {
  const { roomId } = req.params;
  const room = roomManager.getRoom(roomId);
  if (!room) {
    res.json({ peers: [] });
    return;
  }

  const peers = Array.from(room.peers.values()).map((p) => ({
    peerId: p.peerId,
    userId: p.userId,
    username: p.username,
    avatarUrl: p.avatarUrl,
    hasProducer: !!p.producer && !p.producer.closed,
  }));

  res.json({ peers });
});

export default router;
