/**
 * use-voice-sfu.tsx
 * 
 * SFU-based voice hook using mediasoup-client.
 * Replaces the old P2P use-webrtc.tsx.
 * 
 * Public API is intentionally kept compatible so ActiveCallOverlay,
 * IncomingCallModal, and CallControls require NO changes.
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

interface RemoteStream {
  socketId: string;
  peerId: string;
  userId: number;
  username: string;
  avatarUrl: string | null;
  stream: MediaStream;
  isSpeaking: boolean;
  isMuted: boolean;
  isDeafened: boolean;
  isVideoOn: boolean;
  isScreenSharing: boolean;
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
  localStream: MediaStream | null;
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

function getApiBase(): string {
  // Same origin as the React app (api-server is served on the same host via proxy)
  return '';
}

async function voiceFetch(
  path: string,
  token: string,
  body?: object
): Promise<any> {
  const base = getApiBase();
  const res = await fetch(`${base}/api/voice${path}`, {
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

  // ── Refs (not state — avoid re-render loops) ─────────────────────────────────
  const deviceRef = useRef<Device | null>(null);
  const sendTransportRef = useRef<Transport | null>(null);
  const recvTransportRef = useRef<Transport | null>(null);
  const producerRef = useRef<Producer | null>(null);
  const consumersRef = useRef<Map<string, { consumer: Consumer; stream: MediaStream }>>(new Map());
  const localStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyzerRef = useRef<AnalyserNode | null>(null);
  const speakingRef = useRef(false);
  const activeRoomRef = useRef<string | null>(null);
  const remoteStreamsRef = useRef<Map<string, RemoteStream>>(new Map());

  // ── Helpers ──────────────────────────────────────────────────────────────────

  const syncRemoteStreams = useCallback(() => {
    setRemoteStreamsList(Array.from(remoteStreamsRef.current.values()));
  }, []);

  const cleanupCall = useCallback(() => {
    console.log('[VoiceSFU] Cleaning up call state');

    // Stop local mic
    localStreamRef.current?.getTracks().forEach(t => t.stop());
    localStreamRef.current = null;
    setLocalStream(null);

    // Close audio analysis
    audioContextRef.current?.close();
    audioContextRef.current = null;
    analyzerRef.current = null;

    // Close mediasoup transports (this also closes producer/consumers)
    producerRef.current?.close();
    producerRef.current = null;
    sendTransportRef.current?.close();
    sendTransportRef.current = null;
    recvTransportRef.current?.close();
    recvTransportRef.current = null;
    deviceRef.current = null;

    consumersRef.current.clear();
    remoteStreamsRef.current.clear();
    syncRemoteStreams();

    setActiveCallRoom(null);
    activeRoomRef.current = null;
    setIsMuted(false);
    setIsDeafened(false);
    setIsVideoOn(false);
    setIsScreenSharing(false);
    setLocalSpeaking(false);
  }, [syncRemoteStreams]);

  // ── Consume a remote producer ─────────────────────────────────────────────
  const consumeProducer = useCallback(async (
    roomId: string,
    producerPeerId: string,
    userId: number,
    username: string,
    avatarUrl: string | null,
    socketId: string
  ) => {
    if (!token || !deviceRef.current || !recvTransportRef.current) return;

    try {
      console.log(`[VoiceSFU] Consuming producer from ${username} (${producerPeerId})`);

      const data = await voiceFetch('/consume', token, {
        roomId,
        producerPeerId,
        rtpCapabilities: deviceRef.current.rtpCapabilities,
      });

      const { consumerId, producerId, kind, rtpParameters } = data;

      const consumer = await recvTransportRef.current.consume({
        id: consumerId,
        producerId,
        kind,
        rtpParameters,
      });

      const stream = new MediaStream([consumer.track]);

      consumersRef.current.set(producerPeerId, { consumer, stream });

      remoteStreamsRef.current.set(producerPeerId, {
        socketId,
        peerId: producerPeerId,
        userId,
        username,
        avatarUrl,
        stream,
        isSpeaking: false,
        isMuted: false,
        isDeafened: false,
        isVideoOn: false,
        isScreenSharing: false,
      });
      syncRemoteStreams();

      console.log(`[VoiceSFU] Consumer created for ${username}: ${consumer.id}`);
    } catch (err) {
      console.error(`[VoiceSFU] consumeProducer error for ${username}:`, err);
    }
  }, [token, syncRemoteStreams]);

  // ── Core join logic ──────────────────────────────────────────────────────────
  const joinCall = useCallback(async (roomId: string) => {
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

      // ── Step 1: Join room on voice-server (get transport params) ────────────
      console.log('[VoiceSFU] Calling /api/voice/join...');
      const joinData = await voiceFetch('/join', token, {
        roomId,
        avatarUrl: (user as any).avatarUrl || null,
      });

      const {
        peerId,
        routerRtpCapabilities,
        sendTransportOptions,
        recvTransportOptions,
        existingProducers,
      } = joinData;

      console.log('[VoiceSFU] Join data received, existing producers:', existingProducers.length);

      // ── Step 2: Load mediasoup Device with router capabilities ─────────────
      const device = new Device();
      await device.load({ routerRtpCapabilities });
      deviceRef.current = device;
      console.log('[VoiceSFU] Device loaded');

      // ── Step 3: Create send transport ──────────────────────────────────────
      const sendTransport = device.createSendTransport(sendTransportOptions);
      sendTransportRef.current = sendTransport;

      sendTransport.on('connect', async ({ dtlsParameters }, callback, errback) => {
        try {
          console.log('[VoiceSFU] Connecting send transport...');
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

      sendTransport.on('produce', async ({ kind, rtpParameters }, callback, errback) => {
        try {
          console.log('[VoiceSFU] Producing audio...');
          const { producerId } = await voiceFetch('/produce', token, {
            roomId,
            kind,
            rtpParameters,
            avatarUrl: (user as any).avatarUrl || null,
          });
          callback({ id: producerId });
          console.log('[VoiceSFU] Audio produced, producer ID:', producerId);
        } catch (err: any) {
          errback(err);
        }
      });

      // ── Step 4: Create recv transport ───────────────────────────────────────
      const recvTransport = device.createRecvTransport(recvTransportOptions);
      recvTransportRef.current = recvTransport;

      recvTransport.on('connect', async ({ dtlsParameters }, callback, errback) => {
        try {
          console.log('[VoiceSFU] Connecting recv transport...');
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

      // ── Step 5: Start producing (send mic audio to SFU) ────────────────────
      const audioTrack = stream.getAudioTracks()[0];
      const producer = await sendTransport.produce({ track: audioTrack });
      producerRef.current = producer;
      console.log('[VoiceSFU] Producer started:', producer.id);

      // ── Step 6: Consume all existing producers in the room ─────────────────
      for (const ep of existingProducers) {
        await consumeProducer(
          roomId,
          ep.peerId,
          ep.userId,
          ep.username,
          ep.avatarUrl,
          ep.peerId // use peerId as socketId key for now
        );
      }

      // ── Step 7: Join socket room for presence/notifications ────────────────
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
  }, [token, user, socket, consumeProducer, cleanupCall]);

  // ── Socket event handlers (SFU notifications) ────────────────────────────────
  useEffect(() => {
    if (!socket || !user) return;

    // ── Call ringing events ────────────────────────────────────────────────
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

    // ── SFU: new producer appeared — consume it ────────────────────────────
    const onProducerNew = async (data: {
      peerId: string;
      producerId: string;
      userId: number;
      username: string;
      avatarUrl: string | null;
    }) => {
      const roomId = activeRoomRef.current;
      if (!roomId) return;
      if (data.peerId === `user_${user.id}`) return; // skip own producer

      console.log(`[VoiceSFU] New producer from ${data.username} (${data.peerId})`);
      await consumeProducer(
        roomId,
        data.peerId,
        data.userId,
        data.username,
        data.avatarUrl,
        data.peerId
      );
    };

    // ── SFU: producer left — remove their stream ───────────────────────────
    const onProducerClosed = (data: { peerId: string; userId: number; username: string }) => {
      console.log(`[VoiceSFU] Producer closed: ${data.username} (${data.peerId})`);
      const entry = consumersRef.current.get(data.peerId);
      entry?.consumer.close();
      consumersRef.current.delete(data.peerId);
      remoteStreamsRef.current.delete(data.peerId);
      syncRemoteStreams();
    };

    // ── Peer left voice room ───────────────────────────────────────────────
    const onPeerLeft = (data: { peerId: string; userId: number; username: string }) => {
      console.log(`[VoiceSFU] Peer left: ${data.username}`);
      const entry = consumersRef.current.get(data.peerId);
      entry?.consumer.close();
      consumersRef.current.delete(data.peerId);
      remoteStreamsRef.current.delete(data.peerId);
      syncRemoteStreams();
    };

    // ── UI state relays ────────────────────────────────────────────────────
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

    socket.on('incoming_call', onIncomingCall);
    socket.on('call:accepted', onCallAccepted);
    socket.on('call:declined', onCallDeclined);
    socket.on('voice:producer-new', onProducerNew);
    socket.on('voice:producer-closed', onProducerClosed);
    socket.on('voice:peer-left', onPeerLeft);
    socket.on('speaking', onSpeaking);
    socket.on('mute_status', onMuteStatus);
    socket.on('deafen_status', onDeafenStatus);

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
    localStreamRef.current.getAudioTracks().forEach(t => { t.enabled = !newState; });
    setIsMuted(newState);
    socket?.emit('mute_status', { roomId: activeRoomRef.current, isMuted: newState });
  };

  const toggleDeafen = () => {
    const newState = !isDeafened;
    setIsDeafened(newState);
    if (newState && !isMuted) toggleMute();
    socket?.emit('deafen_status', { roomId: activeRoomRef.current, isDeafened: newState });
  };

  // Video/screen share: not yet fully supported in SFU (audio-only for now)
  // Stubs kept to maintain API compatibility with UI components
  const toggleVideo = async () => {
    console.warn('[VoiceSFU] Video not yet implemented in SFU mode');
  };

  const toggleScreenShare = async () => {
    console.warn('[VoiceSFU] Screen share not yet implemented in SFU mode');
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
