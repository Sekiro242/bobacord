/**
 * use-voice-sfu.tsx
 *
 * SFU-based voice + video + screen-share hook using mediasoup-client.
 *
 * Each peer can simultaneously hold up to 3 producers:
 *   - audio  (streamType: "audio")    — always present when in a call
 *   - camera (streamType: "camera")   — optional webcam video
 *   - screen (streamType: "screen")   — optional screen share
 *
 * RemoteStream now carries separate audioStream / videoStream / screenStream
 * so the UI can render audio and video independently.
 */
import {
  useState,
  useEffect,
  useRef,
  useCallback,
  createContext,
  useContext,
} from 'react';
import { Device } from 'mediasoup-client';
import type { Transport, Producer, Consumer } from 'mediasoup-client/lib/types';
import { useSocket } from './use-socket';
import { useAuth } from './use-auth';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface IncomingCall {
  roomId: string;
  callerId: number;
  callerName: string;
  callerAvatarUrl?: string | null;
}

export interface RemoteStream {
  socketId: string;
  peerId: string;
  userId: number;
  username: string;
  avatarUrl: string | null;
  /** Mic audio — always present for connected peers */
  audioStream: MediaStream | null;
  /** Webcam video — non-null when peer has camera on */
  videoStream: MediaStream | null;
  /** Screen share video — non-null when peer is sharing their screen */
  screenStream: MediaStream | null;
  isSpeaking: boolean;
  isMuted: boolean;
  isDeafened: boolean;
  isVideoOn: boolean;
  isScreenSharing: boolean;
}

interface ConsumerEntry {
  consumer: Consumer;
  peerId: string;
  kind: 'audio' | 'video';
  streamType: string;
  stream: MediaStream;
}

interface VoiceSFUContextValue {
  activeCallRoom: string | null;
  isMuted: boolean;
  isDeafened: boolean;
  isVideoOn: boolean;
  isScreenSharing: boolean;
  incomingCall: IncomingCall | null;
  remoteStreams: RemoteStream[];
  localSpeaking: boolean;
  /** Mic audio stream (always captured on join) */
  localStream: MediaStream | null;
  /** Camera video stream (non-null while camera is on) */
  localVideoStream: MediaStream | null;
  /** Screen share stream (non-null while sharing) */
  localScreenStream: MediaStream | null;
  inviteToCall: (roomId: string, targetUserIds: number[]) => void;
  joinCall: (roomId: string) => Promise<void>;
  acceptCall: (incoming: IncomingCall) => Promise<void>;
  declineCall: (incoming: IncomingCall) => void;
  leaveCall: () => void;
  toggleMute: () => void;
  toggleDeafen: () => void;
  toggleVideo: () => Promise<void>;
  toggleScreenShare: () => Promise<void>;
}

const VoiceSFUContext = createContext<VoiceSFUContextValue>({
  activeCallRoom: null,
  isMuted: false,
  isDeafened: false,
  isVideoOn: false,
  isScreenSharing: false,
  incomingCall: null,
  remoteStreams: [],
  localSpeaking: false,
  localStream: null,
  localVideoStream: null,
  localScreenStream: null,
  inviteToCall: () => {},
  joinCall: async () => {},
  acceptCall: async () => {},
  declineCall: () => {},
  leaveCall: () => {},
  toggleMute: () => {},
  toggleDeafen: () => {},
  toggleVideo: async () => {},
  toggleScreenShare: async () => {},
});

export function useVoiceSFU() {
  return useContext(VoiceSFUContext);
}

// ─── REST helper ──────────────────────────────────────────────────────────────

async function voiceFetch(
  path: string,
  token: string,
  body?: object
): Promise<any> {
  const res = await fetch(`/api/voice${path}`, {
    method: body !== undefined ? 'POST' : 'GET',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
  return data;
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function VoiceSFUProvider({ children }: { children: React.ReactNode }) {
  const { socket } = useSocket();
  const { user, token } = useAuth() as any;

  // ── State ────────────────────────────────────────────────────────────────────
  const [activeCallRoom, setActiveCallRoom] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isDeafened, setIsDeafened] = useState(false);
  const [isVideoOn, setIsVideoOn] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [localSpeaking, setLocalSpeaking] = useState(false);
  const [incomingCall, setIncomingCall] = useState<IncomingCall | null>(null);
  const [remoteStreamsList, setRemoteStreamsList] = useState<RemoteStream[]>([]);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [localVideoStream, setLocalVideoStream] = useState<MediaStream | null>(null);
  const [localScreenStream, setLocalScreenStream] = useState<MediaStream | null>(null);

  // ── Refs (avoid re-render loops) ─────────────────────────────────────────────
  const deviceRef = useRef<Device | null>(null);
  const sendTransportRef = useRef<Transport | null>(null);
  const recvTransportRef = useRef<Transport | null>(null);
  /** Audio mic producer */
  const audioProducerRef = useRef<Producer | null>(null);
  /** Camera video producer */
  const videoProducerRef = useRef<Producer | null>(null);
  /** Screen share producer */
  const screenProducerRef = useRef<Producer | null>(null);
  /** All active consumers keyed by producerId */
  const consumersRef = useRef<Map<string, ConsumerEntry>>(new Map());
  const localStreamRef = useRef<MediaStream | null>(null);
  const localVideoStreamRef = useRef<MediaStream | null>(null);
  const localScreenStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyzerRef = useRef<AnalyserNode | null>(null);
  const speakingRef = useRef(false);
  const activeRoomRef = useRef<string | null>(null);
  /** Remote streams keyed by peerId */
  const remoteStreamsRef = useRef<Map<string, RemoteStream>>(new Map());
  const isVideoOnRef = useRef(false);
  const isScreenSharingRef = useRef(false);

  // ── Helpers ──────────────────────────────────────────────────────────────────

  const syncRemoteStreams = useCallback(() => {
    setRemoteStreamsList(Array.from(remoteStreamsRef.current.values()));
  }, []);

  const cleanupCall = useCallback(() => {
    console.log('[VoiceSFU] Cleaning up call state');

    // Stop local mic
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    setLocalStream(null);

    // Stop local camera
    videoProducerRef.current?.close();
    videoProducerRef.current = null;
    localVideoStreamRef.current?.getTracks().forEach((t) => t.stop());
    localVideoStreamRef.current = null;
    setLocalVideoStream(null);

    // Stop local screen share
    screenProducerRef.current?.close();
    screenProducerRef.current = null;
    localScreenStreamRef.current?.getTracks().forEach((t) => t.stop());
    localScreenStreamRef.current = null;
    setLocalScreenStream(null);

    // Close audio analysis
    audioContextRef.current?.close();
    audioContextRef.current = null;
    analyzerRef.current = null;

    // Close mediasoup transports (closes all producers/consumers)
    audioProducerRef.current?.close();
    audioProducerRef.current = null;
    sendTransportRef.current?.close();
    sendTransportRef.current = null;
    recvTransportRef.current?.close();
    recvTransportRef.current = null;
    deviceRef.current = null;

    consumersRef.current.forEach((entry) => entry.consumer.close());
    consumersRef.current.clear();
    remoteStreamsRef.current.clear();
    syncRemoteStreams();

    setActiveCallRoom(null);
    activeRoomRef.current = null;
    setIsMuted(false);
    setIsDeafened(false);
    setIsVideoOn(false);
    isVideoOnRef.current = false;
    setIsScreenSharing(false);
    isScreenSharingRef.current = false;
    setLocalSpeaking(false);
  }, [syncRemoteStreams]);

  // ── Consume a remote producer (audio, camera, or screen) ─────────────────────
  const consumeProducer = useCallback(
    async (params: {
      roomId: string;
      peerId: string;
      producerId: string;
      kind: 'audio' | 'video';
      streamType: string;
      userId: number;
      username: string;
      avatarUrl: string | null;
    }) => {
      if (!token || !deviceRef.current || !recvTransportRef.current) return;

      const { roomId, peerId, producerId, kind, streamType, userId, username, avatarUrl } = params;

      try {
        console.log(`[VoiceSFU] Consuming ${streamType} producer ${producerId} from ${username}`);

        const data = await voiceFetch('/consume', token, {
          roomId,
          producerId,
          rtpCapabilities: deviceRef.current.rtpCapabilities,
        });

        const consumer: Consumer = await recvTransportRef.current.consume({
          id: data.consumerId,
          producerId: data.producerId,
          kind: data.kind,
          rtpParameters: data.rtpParameters,
        });

        const stream = new MediaStream([consumer.track]);

        consumersRef.current.set(producerId, {
          consumer,
          peerId,
          kind,
          streamType,
          stream,
        });

        // Get or initialise the remote stream entry for this peer
        const existing = remoteStreamsRef.current.get(peerId);
        const peerEntry: RemoteStream = existing ?? {
          socketId: peerId,
          peerId,
          userId,
          username,
          avatarUrl,
          audioStream: null,
          videoStream: null,
          screenStream: null,
          isSpeaking: false,
          isMuted: false,
          isDeafened: false,
          isVideoOn: false,
          isScreenSharing: false,
        };

        if (streamType === 'audio') {
          remoteStreamsRef.current.set(peerId, { ...peerEntry, audioStream: stream });
        } else if (streamType === 'camera') {
          remoteStreamsRef.current.set(peerId, { ...peerEntry, videoStream: stream, isVideoOn: true });
        } else if (streamType === 'screen') {
          remoteStreamsRef.current.set(peerId, { ...peerEntry, screenStream: stream, isScreenSharing: true });
        }

        syncRemoteStreams();
        console.log(`[VoiceSFU] Consumer created for ${username} (${streamType}): ${consumer.id}`);
      } catch (err) {
        console.error(`[VoiceSFU] consumeProducer error for ${username} (${streamType}):`, err);
      }
    },
    [token, syncRemoteStreams]
  );

  // ── Core join logic ──────────────────────────────────────────────────────────
  const joinCall = useCallback(
    async (roomId: string) => {
      if (!token || !user) return;

      try {
        console.log('[VoiceSFU] Requesting microphone...');
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        console.log('[VoiceSFU] Microphone granted');

        localStreamRef.current = stream;
        setLocalStream(stream);

        // Speaking detection via AudioContext analyser
        const audioCtx = new AudioContext();
        const source = audioCtx.createMediaStreamSource(stream);
        const analyzer = audioCtx.createAnalyser();
        analyzer.fftSize = 256;
        source.connect(analyzer);
        audioContextRef.current = audioCtx;
        analyzerRef.current = analyzer;

        const bufData = new Uint8Array(analyzer.frequencyBinCount);
        const checkSpeaking = () => {
          if (!analyzerRef.current) return;
          analyzerRef.current.getByteFrequencyData(bufData);
          const avg = bufData.reduce((a, b) => a + b, 0) / bufData.length;
          const speaking = avg > 12;
          if (speaking !== speakingRef.current) {
            speakingRef.current = speaking;
            setLocalSpeaking(speaking);
            socket?.emit('speaking', { roomId, isSpeaking: speaking });
          }
          requestAnimationFrame(checkSpeaking);
        };
        requestAnimationFrame(checkSpeaking);

        // ── Step 1: Join room on voice-server ───────────────────────────────────
        console.log('[VoiceSFU] Calling /api/voice/join...');
        const joinData = await voiceFetch('/join', token, {
          roomId,
          avatarUrl: (user as any).avatarUrl || null,
        });

        const { peerId, routerRtpCapabilities, sendTransportOptions, recvTransportOptions, existingProducers } = joinData;
        console.log('[VoiceSFU] Join data received, existing producers:', existingProducers.length);

        // ── Step 2: Load mediasoup Device ──────────────────────────────────────
        const device = new Device();
        await device.load({ routerRtpCapabilities });
        deviceRef.current = device;
        console.log('[VoiceSFU] Device loaded');

        // ── Step 3: Create send transport ──────────────────────────────────────
        const sendTransport = device.createSendTransport(sendTransportOptions);
        sendTransportRef.current = sendTransport;

        sendTransport.on('connect', async ({ dtlsParameters }, callback, errback) => {
          try {
            await voiceFetch('/connect-transport', token, {
              roomId,
              transportId: sendTransport.id,
              dtlsParameters,
            });
            callback();
          } catch (err: any) {
            errback(err);
          }
        });

        sendTransport.on('produce', async ({ kind, rtpParameters, appData }, callback, errback) => {
          try {
            console.log(`[VoiceSFU] Producing ${(appData as any)?.streamType || kind}...`);
            const { producerId } = await voiceFetch('/produce', token, {
              roomId,
              kind,
              rtpParameters,
              appData,
              avatarUrl: (user as any).avatarUrl || null,
            });
            callback({ id: producerId });
            console.log(`[VoiceSFU] Producer ID: ${producerId} (${(appData as any)?.streamType || kind})`);
          } catch (err: any) {
            errback(err);
          }
        });

        // ── Step 4: Create recv transport ───────────────────────────────────────
        const recvTransport = device.createRecvTransport(recvTransportOptions);
        recvTransportRef.current = recvTransport;

        recvTransport.on('connect', async ({ dtlsParameters }, callback, errback) => {
          try {
            await voiceFetch('/connect-transport', token, {
              roomId,
              transportId: recvTransport.id,
              dtlsParameters,
            });
            callback();
          } catch (err: any) {
            errback(err);
          }
        });

        // ── Step 5: Start producing mic audio ───────────────────────────────────
        const audioTrack = stream.getAudioTracks()[0];
        const audioProducer = await sendTransport.produce({
          track: audioTrack,
          appData: { streamType: 'audio' },
        });
        audioProducerRef.current = audioProducer;
        console.log('[VoiceSFU] Audio producer started:', audioProducer.id);

        // ── Step 6: Consume all existing producers (audio + video + screen) ─────
        for (const ep of existingProducers) {
          await consumeProducer({
            roomId,
            peerId: ep.peerId,
            producerId: ep.producerId,
            kind: ep.kind,
            streamType: ep.streamType,
            userId: ep.userId,
            username: ep.username,
            avatarUrl: ep.avatarUrl,
          });
        }

        // ── Step 7: Join socket room for presence notifications ─────────────────
        socket?.emit('voice:join-room', {
          roomId,
          avatarUrl: (user as any).avatarUrl || null,
        });

        activeRoomRef.current = roomId;
        setActiveCallRoom(roomId);
        console.log('[VoiceSFU] Fully joined room', roomId);
      } catch (err: any) {
        console.error('[VoiceSFU] joinCall error:', err);
        cleanupCall();
        if (err.name === 'NotAllowedError' || err.name === 'NotFoundError') {
          alert('Microphone access is required for voice calls. Please allow microphone access and try again.');
        } else {
          alert(`Failed to join voice call: ${err.message}`);
        }
      }
    },
    [token, user, socket, consumeProducer, cleanupCall]
  );

  // ── Socket event handlers ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!socket || !user) return;

    const onIncomingCall = (data: IncomingCall) => {
      console.log('[VoiceSFU] Incoming call from', data.callerName, 'room:', data.roomId);
      setIncomingCall(data);
    };

    const onCallAccepted = (data: { roomId: string; acceptedByName: string }) => {
      console.log('[VoiceSFU] Call accepted by', data.acceptedByName);
    };

    const onCallDeclined = (data: { roomId: string; declinedByName: string }) => {
      console.log('[VoiceSFU] Call declined by', data.declinedByName);
      alert(`${data.declinedByName} declined the call.`);
    };

    // New producer appeared — audio, camera, or screen
    const onProducerNew = async (data: {
      peerId: string;
      producerId: string;
      kind: 'audio' | 'video';
      streamType: string;
      userId: number;
      username: string;
      avatarUrl: string | null;
    }) => {
      const roomId = activeRoomRef.current;
      if (!roomId) return;
      if (data.peerId === `user_${user.id}`) return; // skip own producers

      console.log(`[VoiceSFU] New ${data.streamType} producer from ${data.username}`);
      await consumeProducer({
        roomId,
        peerId: data.peerId,
        producerId: data.producerId,
        kind: data.kind,
        streamType: data.streamType,
        userId: data.userId,
        username: data.username,
        avatarUrl: data.avatarUrl,
      });
    };

    // A specific producer was stopped (camera/screen off, NOT peer leaving)
    const onProducerClosed = (data: {
      peerId: string;
      producerId: string;
      streamType: string;
      userId: number;
      username: string;
    }) => {
      console.log(`[VoiceSFU] Producer closed: ${data.username} (${data.streamType})`);

      const entry = consumersRef.current.get(data.producerId);
      if (entry) {
        entry.consumer.close();
        consumersRef.current.delete(data.producerId);
      }

      // Update the remote stream entry accordingly
      const rs = remoteStreamsRef.current.get(data.peerId);
      if (rs) {
        if (data.streamType === 'camera') {
          remoteStreamsRef.current.set(data.peerId, {
            ...rs,
            videoStream: null,
            isVideoOn: false,
          });
        } else if (data.streamType === 'screen') {
          remoteStreamsRef.current.set(data.peerId, {
            ...rs,
            screenStream: null,
            isScreenSharing: false,
          });
        } else {
          // Audio producer closed → peer is gone
          remoteStreamsRef.current.delete(data.peerId);
        }
        syncRemoteStreams();
      }
    };

    // Peer left the voice channel entirely — remove all their streams
    const onPeerLeft = (data: { peerId: string; userId: number; username: string }) => {
      console.log(`[VoiceSFU] Peer left: ${data.username}`);

      // Close all consumers associated with this peer
      for (const [producerId, entry] of consumersRef.current) {
        if (entry.peerId === data.peerId) {
          entry.consumer.close();
          consumersRef.current.delete(producerId);
        }
      }

      remoteStreamsRef.current.delete(data.peerId);
      syncRemoteStreams();
    };

    // ── UI state relays ────────────────────────────────────────────────────────
    const onSpeaking = ({ userId, isSpeaking }: { userId: number; isSpeaking: boolean }) => {
      for (const [peerId, rs] of remoteStreamsRef.current) {
        if (rs.userId === userId) {
          remoteStreamsRef.current.set(peerId, { ...rs, isSpeaking });
          syncRemoteStreams();
          break;
        }
      }
    };

    const onMuteStatus = ({ userId, isMuted }: { userId: number; isMuted: boolean }) => {
      for (const [peerId, rs] of remoteStreamsRef.current) {
        if (rs.userId === userId) {
          remoteStreamsRef.current.set(peerId, { ...rs, isMuted });
          syncRemoteStreams();
          break;
        }
      }
    };

    const onDeafenStatus = ({ userId, isDeafened }: { userId: number; isDeafened: boolean }) => {
      for (const [peerId, rs] of remoteStreamsRef.current) {
        if (rs.userId === userId) {
          remoteStreamsRef.current.set(peerId, { ...rs, isDeafened });
          syncRemoteStreams();
          break;
        }
      }
    };

    const onVideoStatus = ({ userId, isVideoOn }: { userId: number; isVideoOn: boolean }) => {
      for (const [peerId, rs] of remoteStreamsRef.current) {
        if (rs.userId === userId) {
          remoteStreamsRef.current.set(peerId, { ...rs, isVideoOn });
          syncRemoteStreams();
          break;
        }
      }
    };

    const onScreenshareStatus = ({
      userId,
      isScreenSharing,
    }: {
      userId: number;
      isScreenSharing: boolean;
    }) => {
      for (const [peerId, rs] of remoteStreamsRef.current) {
        if (rs.userId === userId) {
          remoteStreamsRef.current.set(peerId, { ...rs, isScreenSharing });
          syncRemoteStreams();
          break;
        }
      }
    };

    socket.on('incoming_call', onIncomingCall);
    socket.on('call:accepted', onCallAccepted);
    socket.on('call:declined', onCallDeclined);
    socket.on('voice:producer-new', onProducerNew);
    socket.on('voice:producer-closed', onProducerClosed);
    socket.on('voice:peer-left', onPeerLeft);
    socket.on('speaking', onSpeaking);
    socket.on('mute_status', onMuteStatus);
    socket.on('deafen_status', onDeafenStatus);
    socket.on('video_status', onVideoStatus);
    socket.on('screenshare_status', onScreenshareStatus);

    return () => {
      socket.off('incoming_call', onIncomingCall);
      socket.off('call:accepted', onCallAccepted);
      socket.off('call:declined', onCallDeclined);
      socket.off('voice:producer-new', onProducerNew);
      socket.off('voice:producer-closed', onProducerClosed);
      socket.off('voice:peer-left', onPeerLeft);
      socket.off('speaking', onSpeaking);
      socket.off('mute_status', onMuteStatus);
      socket.off('deafen_status', onDeafenStatus);
      socket.off('video_status', onVideoStatus);
      socket.off('screenshare_status', onScreenshareStatus);
    };
  }, [socket, user, consumeProducer, syncRemoteStreams]);

  // ── Public API ────────────────────────────────────────────────────────────────

  const inviteToCall = (roomId: string, targetUserIds: number[]) => {
    socket?.emit('call:invite', { roomId, targetUserIds });
  };

  const acceptCall = async (incoming: IncomingCall) => {
    console.log('[VoiceSFU] Accepting call from', incoming.callerName);
    socket?.emit('call:accept', { roomId: incoming.roomId, callerId: incoming.callerId });
    setIncomingCall(null);
    await joinCall(incoming.roomId);
  };

  const declineCall = (incoming: IncomingCall) => {
    console.log('[VoiceSFU] Declining call from', incoming.callerName);
    socket?.emit('call:decline', { roomId: incoming.roomId, callerId: incoming.callerId });
    setIncomingCall(null);
  };

  const leaveCall = async () => {
    const roomId = activeRoomRef.current;
    if (!roomId || !token) return;

    console.log('[VoiceSFU] Leaving room', roomId);
    socket?.emit('voice:leave-room', { roomId });

    try {
      await voiceFetch('/leave', token, { roomId });
    } catch (err) {
      console.error('[VoiceSFU] leaveCall REST error:', err);
    }

    cleanupCall();
  };

  const toggleMute = () => {
    if (!localStreamRef.current) return;
    const newState = !isMuted;
    localStreamRef.current.getAudioTracks().forEach((t) => {
      t.enabled = !newState;
    });
    setIsMuted(newState);
    socket?.emit('mute_status', { roomId: activeRoomRef.current, isMuted: newState });
  };

  const toggleDeafen = () => {
    const newState = !isDeafened;
    setIsDeafened(newState);
    if (newState && !isMuted) toggleMute();
    socket?.emit('deafen_status', { roomId: activeRoomRef.current, isDeafened: newState });
  };

  // ── Camera video toggle ────────────────────────────────────────────────────────
  const toggleVideo = async () => {
    const roomId = activeRoomRef.current;
    if (!roomId || !token) return;

    if (isVideoOnRef.current) {
      // ── Turn camera OFF ──────────────────────────────────────────────────────
      const producerId = videoProducerRef.current?.id;

      // Close client-side producer first
      videoProducerRef.current?.close();
      videoProducerRef.current = null;

      // Stop camera tracks
      localVideoStreamRef.current?.getTracks().forEach((t) => t.stop());
      localVideoStreamRef.current = null;
      setLocalVideoStream(null);

      setIsVideoOn(false);
      isVideoOnRef.current = false;

      // Tell server to close the producer (broadcasts voice:producer-closed to room)
      if (producerId) {
        try {
          await voiceFetch('/stop-produce', token, { roomId, producerId });
        } catch (err) {
          console.error('[VoiceSFU] stop-produce (camera) error:', err);
        }
      }

      socket?.emit('video_status', { roomId, isVideoOn: false });
    } else {
      // ── Turn camera ON ───────────────────────────────────────────────────────
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 1280 },
            height: { ideal: 720 },
            frameRate: { ideal: 30 },
          },
          audio: false,
        });

        localVideoStreamRef.current = stream;
        setLocalVideoStream(stream);

        const videoTrack = stream.getVideoTracks()[0];

        // If sendTransport is not ready (joining failed partially), abort
        if (!sendTransportRef.current) {
          stream.getTracks().forEach((t) => t.stop());
          throw new Error('Send transport not ready');
        }

        const producer = await sendTransportRef.current.produce({
          track: videoTrack,
          encodings: [
            { maxBitrate: 100_000, scaleResolutionDownBy: 4 },
            { maxBitrate: 300_000, scaleResolutionDownBy: 2 },
            { maxBitrate: 900_000, scaleResolutionDownBy: 1 },
          ],
          codecOptions: { videoGoogleStartBitrate: 1000 },
          appData: { streamType: 'camera' },
        });

        videoProducerRef.current = producer;

        // Handle camera stream ended by user (e.g., OS-level permission revoke)
        videoTrack.addEventListener('ended', () => {
          console.log('[VoiceSFU] Camera track ended externally');
          if (isVideoOnRef.current) {
            toggleVideo();
          }
        });

        setIsVideoOn(true);
        isVideoOnRef.current = true;
        socket?.emit('video_status', { roomId, isVideoOn: true });
        console.log('[VoiceSFU] Camera producer started:', producer.id);
      } catch (err: any) {
        console.error('[VoiceSFU] toggleVideo ON error:', err);
        localVideoStreamRef.current?.getTracks().forEach((t) => t.stop());
        localVideoStreamRef.current = null;
        setLocalVideoStream(null);
        if (err.name === 'NotAllowedError') {
          alert('Camera access was denied. Please allow camera access and try again.');
        } else {
          alert(`Could not start camera: ${err.message}`);
        }
      }
    }
  };

  // ── Screen share toggle ────────────────────────────────────────────────────────
  const toggleScreenShare = async () => {
    const roomId = activeRoomRef.current;
    if (!roomId || !token) return;

    if (isScreenSharingRef.current) {
      // ── Stop screen share ────────────────────────────────────────────────────
      const producerId = screenProducerRef.current?.id;

      screenProducerRef.current?.close();
      screenProducerRef.current = null;

      localScreenStreamRef.current?.getTracks().forEach((t) => t.stop());
      localScreenStreamRef.current = null;
      setLocalScreenStream(null);

      setIsScreenSharing(false);
      isScreenSharingRef.current = false;

      if (producerId) {
        try {
          await voiceFetch('/stop-produce', token, { roomId, producerId });
        } catch (err) {
          console.error('[VoiceSFU] stop-produce (screen) error:', err);
        }
      }

      socket?.emit('screenshare_status', { roomId, isScreenSharing: false });
    } else {
      // ── Start screen share ───────────────────────────────────────────────────
      try {
        const stream = await (navigator.mediaDevices as any).getDisplayMedia({
          video: {
            width: { ideal: 1920 },
            height: { ideal: 1080 },
            frameRate: { ideal: 30 },
          },
          audio: false,
        });

        localScreenStreamRef.current = stream;
        setLocalScreenStream(stream);

        const screenTrack = stream.getVideoTracks()[0];

        if (!sendTransportRef.current) {
          stream.getTracks().forEach((t) => t.stop());
          throw new Error('Send transport not ready');
        }

        const producer = await sendTransportRef.current.produce({
          track: screenTrack,
          encodings: [{ maxBitrate: 1_500_000 }],
          codecOptions: { videoGoogleStartBitrate: 1000 },
          appData: { streamType: 'screen' },
        });

        screenProducerRef.current = producer;

        // Browser "Stop Sharing" button clicked by user
        screenTrack.addEventListener('ended', () => {
          console.log('[VoiceSFU] Screen track ended by user (browser stop button)');
          if (isScreenSharingRef.current) {
            toggleScreenShare();
          }
        });

        setIsScreenSharing(true);
        isScreenSharingRef.current = true;
        socket?.emit('screenshare_status', { roomId, isScreenSharing: true });
        console.log('[VoiceSFU] Screen producer started:', producer.id);
      } catch (err: any) {
        console.error('[VoiceSFU] toggleScreenShare ON error:', err);
        localScreenStreamRef.current?.getTracks().forEach((t) => t.stop());
        localScreenStreamRef.current = null;
        setLocalScreenStream(null);
        if (err.name === 'NotAllowedError') {
          // User cancelled the picker — not an error worth alerting
          console.log('[VoiceSFU] Screen share cancelled by user');
        } else {
          alert(`Could not start screen share: ${err.message}`);
        }
      }
    }
  };

  return (
    <VoiceSFUContext.Provider
      value={{
        activeCallRoom,
        isMuted,
        isDeafened,
        isVideoOn,
        isScreenSharing,
        incomingCall,
        remoteStreams: remoteStreamsList,
        localSpeaking,
        localStream,
        localVideoStream,
        localScreenStream,
        inviteToCall,
        joinCall,
        acceptCall,
        declineCall,
        leaveCall,
        toggleMute,
        toggleDeafen,
        toggleVideo,
        toggleScreenShare,
      }}
    >
      {children}
    </VoiceSFUContext.Provider>
  );
}
