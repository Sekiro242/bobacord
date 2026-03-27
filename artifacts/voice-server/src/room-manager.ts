import type {
  Router,
  Producer,
  Consumer,
  WebRtcTransport,
  Worker,
} from "mediasoup/node/lib/types.js";
import { mediaCodecs, getWebRtcTransportOptions } from "./mediasoup-config.js";
import { logger } from "./logger.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PeerInfo {
  peerId: string;
  userId: number;
  username: string;
  avatarUrl?: string | null;
  sendTransport: WebRtcTransport | null;
  recvTransport: WebRtcTransport | null;
  producer: Producer | null;
  consumers: Map<string, Consumer>; // producerId → Consumer
}

export interface RoomInfo {
  roomId: string;
  router: Router;
  peers: Map<string, PeerInfo>; // peerId → PeerInfo
}

// ─── Room Manager ─────────────────────────────────────────────────────────────

class RoomManager {
  private rooms = new Map<string, RoomInfo>();
  private worker: Worker | null = null;

  setWorker(worker: Worker) {
    this.worker = worker;
  }

  // Get or create a room (router) for a given voice channel
  async getOrCreateRoom(roomId: string): Promise<RoomInfo> {
    if (this.rooms.has(roomId)) {
      return this.rooms.get(roomId)!;
    }

    if (!this.worker) throw new Error("mediasoup Worker not initialised");

    logger.info({ roomId }, "Creating new mediasoup Router for room");
    const router = await this.worker.createRouter({ mediaCodecs });

    const room: RoomInfo = {
      roomId,
      router,
      peers: new Map(),
    };
    this.rooms.set(roomId, room);
    return room;
  }

  getRoom(roomId: string): RoomInfo | undefined {
    return this.rooms.get(roomId);
  }

  // Add a peer to a room (called when they join)
  async addPeer(
    roomId: string,
    peerId: string,
    userId: number,
    username: string,
    avatarUrl?: string | null
  ): Promise<{ room: RoomInfo; peer: PeerInfo }> {
    const room = await this.getOrCreateRoom(roomId);

    if (room.peers.has(peerId)) {
      // already in room — return existing
      return { room, peer: room.peers.get(peerId)! };
    }

    const peer: PeerInfo = {
      peerId,
      userId,
      username,
      avatarUrl,
      sendTransport: null,
      recvTransport: null,
      producer: null,
      consumers: new Map(),
    };

    room.peers.set(peerId, peer);
    logger.info({ roomId, peerId, username }, "Peer added to room");
    return { room, peer };
  }

  // Create a WebRTC send transport for a peer
  async createSendTransport(
    roomId: string,
    peerId: string
  ): Promise<WebRtcTransport> {
    const room = this.rooms.get(roomId);
    const peer = room?.peers.get(peerId);
    if (!room || !peer) throw new Error(`Peer ${peerId} not found in room ${roomId}`);

    const transport = await room.router.createWebRtcTransport(
      getWebRtcTransportOptions()
    );

    transport.on("dtlsstatechange", (state) => {
      if (state === "closed") {
        logger.info({ peerId, transportId: transport.id }, "Send transport DTLS closed");
        transport.close();
      }
    });

    peer.sendTransport = transport;
    logger.info({ roomId, peerId, transportId: transport.id }, "Send transport created");
    return transport;
  }

  // Create a WebRTC recv transport for a peer
  async createRecvTransport(
    roomId: string,
    peerId: string
  ): Promise<WebRtcTransport> {
    const room = this.rooms.get(roomId);
    const peer = room?.peers.get(peerId);
    if (!room || !peer) throw new Error(`Peer ${peerId} not found in room ${roomId}`);

    const transport = await room.router.createWebRtcTransport(
      getWebRtcTransportOptions()
    );

    transport.on("dtlsstatechange", (state) => {
      if (state === "closed") {
        logger.info({ peerId, transportId: transport.id }, "Recv transport DTLS closed");
        transport.close();
      }
    });

    peer.recvTransport = transport;
    logger.info({ roomId, peerId, transportId: transport.id }, "Recv transport created");
    return transport;
  }

  // Connect a transport (client sends DTLS params back)
  async connectTransport(
    roomId: string,
    peerId: string,
    transportId: string,
    dtlsParameters: any
  ): Promise<void> {
    const room = this.rooms.get(roomId);
    const peer = room?.peers.get(peerId);
    if (!room || !peer) throw new Error(`Peer ${peerId} not found`);

    const transport =
      peer.sendTransport?.id === transportId
        ? peer.sendTransport
        : peer.recvTransport?.id === transportId
        ? peer.recvTransport
        : null;

    if (!transport) throw new Error(`Transport ${transportId} not found for peer ${peerId}`);

    await transport.connect({ dtlsParameters });
    logger.info({ peerId, transportId }, "Transport connected");
  }

  // Start producing (client is sending audio)
  async produce(
    roomId: string,
    peerId: string,
    kind: "audio" | "video",
    rtpParameters: any
  ): Promise<Producer> {
    const room = this.rooms.get(roomId);
    const peer = room?.peers.get(peerId);
    if (!room || !peer || !peer.sendTransport)
      throw new Error(`Send transport not ready for peer ${peerId}`);

    const producer = await peer.sendTransport.produce({ kind, rtpParameters });

    producer.on("transportclose", () => {
      logger.info({ peerId, producerId: producer.id }, "Producer transport closed");
      producer.close();
    });

    peer.producer = producer;
    logger.info({ roomId, peerId, producerId: producer.id }, "Producer created");
    return producer;
  }

  // Create a consumer for a peer to receive another peer's audio
  async consume(
    roomId: string,
    consumerPeerId: string,
    producerPeerId: string,
    rtpCapabilities: any
  ): Promise<{ consumer: Consumer; producerInfo: PeerInfo }> {
    const room = this.rooms.get(roomId);
    const consumerPeer = room?.peers.get(consumerPeerId);
    const producerPeer = room?.peers.get(producerPeerId);

    if (!room || !consumerPeer || !producerPeer)
      throw new Error(`Peers not found in room ${roomId}`);

    if (!producerPeer.producer)
      throw new Error(`Producer peer ${producerPeerId} has no active producer`);

    if (!consumerPeer.recvTransport)
      throw new Error(`Consumer peer ${consumerPeerId} has no recv transport`);

    if (!room.router.canConsume({ producerId: producerPeer.producer.id, rtpCapabilities }))
      throw new Error(`Router cannot consume producer ${producerPeer.producer.id}`);

    const consumer = await consumerPeer.recvTransport.consume({
      producerId: producerPeer.producer.id,
      rtpCapabilities,
      paused: false,
    });

    consumer.on("transportclose", () => {
      logger.info({ consumerPeerId, consumerId: consumer.id }, "Consumer transport closed");
    });

    consumer.on("producerclose", () => {
      logger.info({ consumerPeerId, consumerId: consumer.id }, "Producer closed — removing consumer");
      consumerPeer.consumers.delete(producerPeer.producer!.id);
    });

    consumerPeer.consumers.set(producerPeer.producer.id, consumer);
    logger.info(
      { roomId, consumerPeerId, producerPeerId, consumerId: consumer.id },
      "Consumer created"
    );

    return { consumer, producerInfo: producerPeer };
  }

  // Get all existing producers in a room except the requesting peer
  getExistingProducers(
    roomId: string,
    excludePeerId: string
  ): Array<{ peerId: string; producerId: string; userId: number; username: string; avatarUrl?: string | null }> {
    const room = this.rooms.get(roomId);
    if (!room) return [];

    const result: Array<{ peerId: string; producerId: string; userId: number; username: string; avatarUrl?: string | null }> = [];
    for (const [peerId, peer] of room.peers) {
      if (peerId !== excludePeerId && peer.producer && !peer.producer.closed) {
        result.push({
          peerId,
          producerId: peer.producer.id,
          userId: peer.userId,
          username: peer.username,
          avatarUrl: peer.avatarUrl,
        });
      }
    }
    return result;
  }

  // Remove a peer from a room (on leave/disconnect)
  removePeer(roomId: string, peerId: string): PeerInfo | undefined {
    const room = this.rooms.get(roomId);
    if (!room) return undefined;

    const peer = room.peers.get(peerId);
    if (!peer) return undefined;

    // Close all consumers this peer created
    for (const consumer of peer.consumers.values()) {
      consumer.close();
    }

    // Close this peer's producer
    peer.producer?.close();

    // Close transports
    peer.sendTransport?.close();
    peer.recvTransport?.close();

    room.peers.delete(peerId);
    logger.info({ roomId, peerId }, "Peer removed from room");

    // Clean up empty rooms
    if (room.peers.size === 0) {
      room.router.close();
      this.rooms.delete(roomId);
      logger.info({ roomId }, "Room closed (empty)");
    }

    return peer;
  }

  // Get room RTP capabilities (client needs these to create Device)
  getRtpCapabilities(roomId: string): any {
    const room = this.rooms.get(roomId);
    if (!room) throw new Error(`Room ${roomId} not found`);
    return room.router.rtpCapabilities;
  }
}

// Export singleton
export const roomManager = new RoomManager();
