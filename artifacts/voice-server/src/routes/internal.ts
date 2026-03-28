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
// Returns: routerRtpCapabilities + both transport params + existingProducers.
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

    // All existing producers (audio + camera + screen) the new peer should consume
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
// Client begins sending a track (audio, camera video, or screen share).
// Returns producerId.
// appData.streamType: "audio" | "camera" | "screen"
router.post("/produce", async (req, res) => {
  const { roomId, peerId, kind, rtpParameters, appData } = req.body as {
    roomId: string;
    peerId: string;
    kind: "audio" | "video";
    rtpParameters: any;
    appData?: { streamType?: string };
  };

  if (!roomId || !peerId || !kind || !rtpParameters) {
    res.status(400).json({ error: "Missing required fields" });
    return;
  }

  try {
    logger.info({ roomId, peerId, kind, streamType: appData?.streamType }, "[internal] produce");
    const producer = await roomManager.produce(roomId, peerId, kind, rtpParameters, appData || {});
    res.json({
      producerId: producer.id,
      streamType: (producer.appData as any)?.streamType || (kind === "audio" ? "audio" : "camera"),
    });
  } catch (err: any) {
    logger.error({ err }, "[internal] produce error");
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /internal/stop-produce ─────────────────────────────────────────────
// Close a specific producer (camera off or screen share ended) without
// removing the peer from the room.
// Returns { streamType } so the api-server can broadcast the right event.
router.post("/stop-produce", (req, res) => {
  const { roomId, peerId, producerId } = req.body as {
    roomId: string;
    peerId: string;
    producerId: string;
  };

  if (!roomId || !peerId || !producerId) {
    res.status(400).json({ error: "Missing required fields" });
    return;
  }

  try {
    logger.info({ roomId, peerId, producerId }, "[internal] stop-produce");
    const { streamType } = roomManager.stopProducer(roomId, peerId, producerId);
    res.json({ stopped: true, streamType });
  } catch (err: any) {
    logger.error({ err }, "[internal] stop-produce error");
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /internal/consume ───────────────────────────────────────────────────
// Request to consume a specific producerId.
// Client supplies the producerId it received from voice:producer-new.
router.post("/consume", async (req, res) => {
  const { roomId, consumerPeerId, producerId, rtpCapabilities } = req.body as {
    roomId: string;
    consumerPeerId: string;
    producerId: string;
    rtpCapabilities: any;
  };

  if (!roomId || !consumerPeerId || !producerId || !rtpCapabilities) {
    res.status(400).json({ error: "Missing required fields" });
    return;
  }

  try {
    logger.info({ roomId, consumerPeerId, producerId }, "[internal] consume");
    const { consumer, producerPeer } = await roomManager.consume(
      roomId,
      consumerPeerId,
      producerId,
      rtpCapabilities
    );

    res.json({
      consumerId: consumer.id,
      producerId: consumer.producerId,
      kind: consumer.kind,
      rtpParameters: consumer.rtpParameters,
      producerPeerId: producerPeer.peerId,
      producerUserId: producerPeer.userId,
      producerUsername: producerPeer.username,
      producerAvatarUrl: producerPeer.avatarUrl,
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
// Get all active peers and their producer info.
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
    producers: Array.from(p.producers.values())
      .filter((pr) => !pr.closed)
      .map((pr) => ({
        producerId: pr.id,
        kind: pr.kind,
        streamType: (pr.appData as any)?.streamType || (pr.kind === "audio" ? "audio" : "camera"),
      })),
  }));

  res.json({ peers });
});

// ─── POST /internal/restart-ice ──────────────────────────────────────────────
router.post("/restart-ice", async (req, res) => {
  const { roomId, peerId, transportId } = req.body;

  if (!roomId || !peerId || !transportId) {
    res.status(400).json({ error: "Missing required fields" });
    return;
  }

  try {
    const iceParameters = await roomManager.restartIce(roomId, peerId, transportId);
    res.json(iceParameters);
  } catch (err: any) {
    logger.error({ err }, "[internal] restart-ice error");
    res.status(500).json({ error: err.message });
  }
});

export default router;
