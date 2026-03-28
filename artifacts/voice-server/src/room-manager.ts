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
  /**
   * All active producers for this peer.
   * A peer can have up to 3 simultaneous producers:
   *   audio  (streamType: "audio")
   *   camera (streamType: "camera")
   *   screen (streamType: "screen")
   */
  producers: Map<string, Producer>; // producerId → Producer
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
      return { room, peer: room.peers.get(peerId)! };
    }

    const peer: PeerInfo = {
      peerId,
      userId,
      username,
      avatarUrl,
      sendTransport: null,
      recvTransport: null,
      producers: new Map(),
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

  // Restart ICE for a transport (client needs new parameters)
  async restartIce(
    roomId: string,
    peerId: string,
    transportId: string
  ): Promise<any> {
    const room = this.rooms.get(roomId);
    const peer = room?.peers.get(peerId);
    if (!room || !peer) throw new Error(`Peer ${peerId} not found`);

    const transport =
      peer.sendTransport?.id === transportId
        ? peer.sendTransport
        : peer.recvTransport?.id === transportId
        ? peer.recvTransport
        : null;

    if (!transport) throw new Error(`Transport ${transportId} not found`);

    const iceParameters = await transport.restartIce();
    logger.info({ peerId, transportId }, "ICE restarted");
    return iceParameters;
  }

  // Start producing — supports multiple producers per peer (audio, camera, screen)
  async produce(
    roomId: string,
    peerId: string,
    kind: "audio" | "video",
    rtpParameters: any,
    appData?: Record<string, unknown>
  ): Promise<Producer> {
    const room = this.rooms.get(roomId);
    const peer = room?.peers.get(peerId);
    if (!room || !peer || !peer.sendTransport)
      throw new Error(`Send transport not ready for peer ${peerId}`);

    const producer = await peer.sendTransport.produce({
      kind,
      rtpParameters,
      appData: appData || {},
    });

    producer.on("transportclose", () => {
      logger.info({ peerId, producerId: producer.id }, "Producer transport closed");
      peer.producers.delete(producer.id);
      producer.close();
    });

    peer.producers.set(producer.id, producer);
    logger.info(
      { roomId, peerId, producerId: producer.id, kind, streamType: (appData as any)?.streamType || "unknown" },
      "Producer created"
    );
    return producer;
  }

  // Stop a specific producer (camera off / screen share ended)
  stopProducer(
    roomId: string,
    peerId: string,
    producerId: string
  ): { streamType: string } {
    const room = this.rooms.get(roomId);
    const peer = room?.peers.get(peerId);
    if (!room || !peer) throw new Error(`Peer ${peerId} not found in room ${roomId}`);

    const producer = peer.producers.get(producerId);
    if (!producer) throw new Error(`Producer ${producerId} not found for peer ${peerId}`);

    const streamType = (producer.appData as any)?.streamType || "unknown";
    producer.close();
    peer.producers.delete(producerId);

    logger.info({ roomId, peerId, producerId, streamType }, "Producer stopped");
    return { streamType };
  }

  // Create a consumer for a peer to receive another peer's stream by producerId
  async consume(
    roomId: string,
    consumerPeerId: string,
    producerId: string,
    rtpCapabilities: any
  ): Promise<{ consumer: Consumer; producerPeer: PeerInfo }> {
    const room = this.rooms.get(roomId);
    const consumerPeer = room?.peers.get(consumerPeerId);

    if (!room || !consumerPeer)
      throw new Error(`Consumer peer ${consumerPeerId} not found in room ${roomId}`);

    if (!consumerPeer.recvTransport)
      throw new Error(`Consumer peer ${consumerPeerId} has no recv transport`);

    // Find the producer by ID across all peers in the room
    let targetProducer: Producer | null = null;
    let producerPeer: PeerInfo | null = null;

    for (const peer of room.peers.values()) {
      const p = peer.producers.get(producerId);
      if (p && !p.closed) {
        targetProducer = p;
        producerPeer = peer;
        break;
      }
    }

    if (!targetProducer || !producerPeer)
      throw new Error(`Producer ${producerId} not found in room ${roomId}`);

    if (!room.router.canConsume({ producerId: targetProducer.id, rtpCapabilities }))
      throw new Error(`Router cannot consume producer ${producerId}`);

    const consumer = await consumerPeer.recvTransport.consume({
      producerId: targetProducer.id,
      rtpCapabilities,
      paused: false,
    });

    consumer.on("transportclose", () => {
      logger.info({ consumerPeerId, consumerId: consumer.id }, "Consumer transport closed");
      consumerPeer.consumers.delete(producerId);
    });

    consumer.on("producerclose", () => {
      logger.info({ consumerPeerId, consumerId: consumer.id }, "Producer closed — removing consumer");
      consumerPeer.consumers.delete(producerId);
    });

    consumerPeer.consumers.set(producerId, consumer);
    logger.info(
      {
        roomId,
        consumerPeerId,
        producerPeerId: producerPeer.peerId,
        producerId,
        consumerId: consumer.id,
        kind: consumer.kind,
      },
      "Consumer created"
    );

    return { consumer, producerPeer };
  }

  // Get all existing producers in a room except the requesting peer
  // Returns one entry per producer (including audio, camera, screen)
  getExistingProducers(
    roomId: string,
    excludePeerId: string
  ): Array<{
    peerId: string;
    producerId: string;
    kind: "audio" | "video";
    streamType: string;
    userId: number;
    username: string;
    avatarUrl?: string | null;
  }> {
    const room = this.rooms.get(roomId);
    if (!room) return [];

    const result: Array<{
      peerId: string;
      producerId: string;
      kind: "audio" | "video";
      streamType: string;
      userId: number;
      username: string;
      avatarUrl?: string | null;
    }> = [];

    for (const [peerId, peer] of room.peers) {
      if (peerId === excludePeerId) continue;
      for (const [producerId, producer] of peer.producers) {
        if (!producer.closed) {
          result.push({
            peerId,
            producerId,
            kind: producer.kind,
            streamType:
              (producer.appData as any)?.streamType ||
              (producer.kind === "audio" ? "audio" : "camera"),
            userId: peer.userId,
            username: peer.username,
            avatarUrl: peer.avatarUrl,
          });
        }
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

    // Close all of this peer's producers
    for (const producer of peer.producers.values()) {
      producer.close();
    }

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
