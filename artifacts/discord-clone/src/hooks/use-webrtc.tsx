/**
 * WebRTC context — provides shared call state to all components.
 * Use WebRTCProvider in App.tsx and call useWebRTC() anywhere.
 */
import { useState, useEffect, useRef, useCallback, createContext, useContext } from 'react';
import { useSocket } from './use-socket';
import { useAuth } from './use-auth';

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

export interface IncomingCall {
  roomId: string;
  callerId: number;
  callerName: string;
  callerAvatarUrl?: string | null;
}

interface WebRTCContextValue {
  activeCallRoom: string | null;
  isMuted: boolean;
  isDeafened: boolean;
  isVideoOn: boolean;
  isScreenSharing: boolean;
  incomingCall: IncomingCall | null;
  remoteStreams: { socketId: string; userId: number; username: string; avatarUrl: string | null; stream: MediaStream; isSpeaking: boolean; isMuted: boolean; isDeafened: boolean; isVideoOn: boolean; isScreenSharing: boolean }[];
  inviteToCall: (roomId: string, targetUserIds: number[]) => void;
  joinCall: (roomId: string) => Promise<void>;
  acceptCall: (incoming: IncomingCall) => Promise<void>;
  declineCall: (incoming: IncomingCall) => void;
  leaveCall: () => void;
  toggleMute: () => void;
  toggleDeafen: () => void;
  toggleVideo: () => Promise<void>;
  toggleScreenShare: () => Promise<void>;
  localSpeaking: boolean;
  localStream: MediaStream | null;
}

const WebRTCContext = createContext<WebRTCContextValue>({
  activeCallRoom: null,
  isMuted: false,
  isDeafened: false,
  isVideoOn: false,
  isScreenSharing: false,
  incomingCall: null,
  remoteStreams: [],
  inviteToCall: () => { },
  joinCall: async () => { },
  acceptCall: async () => { },
  declineCall: () => { },
  leaveCall: () => { },
  toggleMute: () => { },
  toggleDeafen: () => { },
  toggleVideo: async () => { },
  toggleScreenShare: async () => { },
  localSpeaking: false,
  localStream: null,
});

export function useWebRTC() {
  return useContext(WebRTCContext);
}

export function WebRTCProvider({ children }: { children: React.ReactNode }) {
  const { socket } = useSocket();
  const { user } = useAuth();

  const [activeCallRoom, setActiveCallRoom] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isDeafened, setIsDeafened] = useState(false);
  const [isVideoOn, setIsVideoOn] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [localSpeaking, setLocalSpeaking] = useState(false);
  const [incomingCall, setIncomingCall] = useState<IncomingCall | null>(null);
  const [remoteStreamsList, setRemoteStreamsList] = useState<
    { socketId: string; userId: number; username: string; avatarUrl: string | null; stream: MediaStream; isSpeaking: boolean; isMuted: boolean; isDeafened: boolean; isVideoOn: boolean; isScreenSharing: boolean }[]
  >([]);

  const localStreamRef = useRef<MediaStream | null>(null);
  // Extracted localStream to state so components can render local video
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);

  const peersRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const remoteStreamsRef = useRef<Map<string, { userId: number; username: string; avatarUrl: string | null; stream: MediaStream; isSpeaking: boolean; isMuted: boolean; isDeafened: boolean; isVideoOn: boolean; isScreenSharing: boolean }>>(new Map());
  const iceCandidateQueueRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyzerRef = useRef<AnalyserNode | null>(null);
  const speakingRef = useRef(false);

  const updateStreamsList = () => {
    setRemoteStreamsList(
      Array.from(remoteStreamsRef.current.entries()).map(([socketId, data]) => ({
        socketId,
        ...data,
      }))
    );
  };

  const cleanupCall = useCallback(() => {
    console.log('[WebRTC] Cleaning up call state');
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(t => t.stop());
      localStreamRef.current = null;
      setLocalStream(null);
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    peersRef.current.forEach(pc => pc.close());
    peersRef.current.clear();
    remoteStreamsRef.current.clear();
    iceCandidateQueueRef.current.clear();
    setRemoteStreamsList([]);
    setActiveCallRoom(null);
    setIsMuted(false);
    setIsDeafened(false);
    setIsVideoOn(false);
    setIsScreenSharing(false);
    setLocalSpeaking(false);
  }, []);

  const createPeerConnection = useCallback(
    (targetSocketId: string, targetUserId: number, targetUsername: string, targetAvatarUrl: string | null) => {
      console.log(`[WebRTC] Creating peer connection → ${targetUsername} (${targetSocketId})`);
      const pc = new RTCPeerConnection(ICE_SERVERS);

      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => {
          pc.addTrack(track, localStreamRef.current!);
        });
        console.log('[WebRTC] Local tracks added to peer connection');
      }

      pc.onicecandidate = (event) => {
        if (event.candidate && socket) {
          console.log(`[WebRTC] ICE candidate → ${targetSocketId}`);
          socket.emit('webrtc_ice', { to: targetSocketId, candidate: event.candidate });
        }
      };

      pc.oniceconnectionstatechange = () => {
        console.log(`[WebRTC] ICE state (${targetUsername}): ${pc.iceConnectionState}`);
      };

      pc.ontrack = (event) => {
        console.log(`[WebRTC] Remote track received from ${targetUsername}:`, event.track.kind);
        if (event.streams?.[0]) {
          const existing = remoteStreamsRef.current.get(targetSocketId);
          remoteStreamsRef.current.set(targetSocketId, {
            userId: targetUserId,
            username: targetUsername,
            avatarUrl: targetAvatarUrl,
            stream: event.streams[0],
            isSpeaking: existing?.isSpeaking ?? false,
            isMuted: existing?.isMuted ?? false,
            isDeafened: existing?.isDeafened ?? false,
            isVideoOn: existing?.isVideoOn ?? false,
            isScreenSharing: existing?.isScreenSharing ?? false,
          });
          updateStreamsList();
        }
      };

      peersRef.current.set(targetSocketId, pc);
      return pc;
    },
    [socket]
  );

  useEffect(() => {
    if (!socket || !user) return;

    // ── Ringing events ───────────────────────────────────────────────────────

    const onIncomingCall = (data: IncomingCall) => {
      console.log('[Call] Incoming call from', data.callerName, '| room:', data.roomId);
      setIncomingCall(data);
    };

    const onCallAccepted = (data: { roomId: string; acceptedByName: string }) => {
      console.log('[Call] Accepted by', data.acceptedByName);
    };

    const onCallDeclined = (data: { roomId: string; declinedByName: string }) => {
      console.log('[Call] Declined by', data.declinedByName);
      alert(`${data.declinedByName} declined the call.`);
    };

    const onCallFull = ({ roomId }: { roomId: string }) => {
      console.warn('[Call] Room full:', roomId);
      alert('The call is full (max 3 participants).');
    };

    // ── WebRTC signaling events ──────────────────────────────────────────────

    // Existing member → new joiner appears → existing member creates offer
    const onUserJoined = async ({ socketId, userId, username, avatarUrl }: { socketId: string; userId: number; username: string; avatarUrl?: string | null }) => {
      if (userId === user.id) return;
      console.log(`[WebRTC] ${username} joined — creating offer`);
      const pc = createPeerConnection(socketId, userId, username, avatarUrl || null);
      try {
        const offer = await pc.createOffer({ offerToReceiveAudio: true });
        await pc.setLocalDescription(offer);
        console.log(`[WebRTC] Offer created → ${username}`);
        socket.emit('webrtc_offer', { to: socketId, offer, avatarUrl: (user as any)?.avatarUrl || null });
      } catch (err) {
        console.error('[WebRTC] createOffer error:', err);
      }
    };

    // New joiner receives offer from existing member → answers
    const onOffer = async ({ from, fromUserId, fromUsername, fromAvatarUrl, offer }: { from: string; fromUserId: number; fromUsername: string; fromAvatarUrl?: string | null; offer: RTCSessionDescriptionInit }) => {
      console.log(`[WebRTC] Offer received from ${fromUsername}`);
      let pc = peersRef.current.get(from);
      if (!pc) pc = createPeerConnection(from, fromUserId, fromUsername, fromAvatarUrl || null);
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        // Flush ICE queue
        const q = iceCandidateQueueRef.current.get(from);
        if (q && q.length > 0) {
          console.log(`[WebRTC] Flushing ${q.length} queued ICE candidates from ${from}`);
          for (const c of q) {
            await pc.addIceCandidate(new RTCIceCandidate(c)).catch(console.error);
          }
          iceCandidateQueueRef.current.delete(from);
        }
        
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        console.log(`[WebRTC] Answer created → ${fromUsername}`);
        socket.emit('webrtc_answer', { to: from, answer });
      } catch (err) {
        console.error('[WebRTC] handleOffer error:', err);
      }
    };

    const onAnswer = async ({ from, answer }: { from: string; answer: RTCSessionDescriptionInit }) => {
      console.log(`[WebRTC] Answer received from ${from}`);
      const pc = peersRef.current.get(from);
      if (pc) {
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(answer));
          // Flush ICE queue
          const q = iceCandidateQueueRef.current.get(from);
          if (q && q.length > 0) {
            console.log(`[WebRTC] Flushing ${q.length} queued ICE candidates from ${from}`);
            for (const c of q) {
              await pc.addIceCandidate(new RTCIceCandidate(c)).catch(console.error);
            }
            iceCandidateQueueRef.current.delete(from);
          }
        } catch (err) {
          console.error('[WebRTC] setRemoteDescription (answer) error:', err);
        }
      }
    };

    const onIce = async ({ from, candidate }: { from: string; candidate: RTCIceCandidateInit }) => {
      const pc = peersRef.current.get(from);
      if (pc && pc.remoteDescription) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
          console.log(`[WebRTC] ICE candidate added from ${from}`);
        } catch (err) {
          console.error('[WebRTC] addIceCandidate error:', err);
        }
      } else {
        console.log(`[WebRTC] Queueing ICE candidate from ${from}`);
        const q = iceCandidateQueueRef.current.get(from) || [];
        q.push(candidate);
        iceCandidateQueueRef.current.set(from, q);
      }
    };

    const onUserLeft = ({ socketId, username }: { socketId: string; userId: number; username: string }) => {
      console.log(`[WebRTC] ${username} left the call`);
      const pc = peersRef.current.get(socketId);
      if (pc) { pc.close(); peersRef.current.delete(socketId); }
      remoteStreamsRef.current.delete(socketId);
      updateStreamsList();
    };

    socket.on('room_users', ({ users }: { users: { socketId: string; userId: number; username: string }[] }) => {
      console.log('[WebRTC] Existing users in room (waiting for their offers):', users);
    });

    socket.on('speaking', ({ socketId, isSpeaking }: { socketId: string; isSpeaking: boolean }) => {
      const data = remoteStreamsRef.current.get(socketId);
      if (data) {
        remoteStreamsRef.current.set(socketId, { ...data, isSpeaking });
        updateStreamsList();
      }
    });

    socket.on('mute_status', ({ socketId, isMuted }: { socketId: string; isMuted: boolean }) => {
      const data = remoteStreamsRef.current.get(socketId);
      if (data) {
        remoteStreamsRef.current.set(socketId, { ...data, isMuted });
        updateStreamsList();
      }
    });

    socket.on('deafen_status', ({ socketId, isDeafened }: { socketId: string; isDeafened: boolean }) => {
      const data = remoteStreamsRef.current.get(socketId);
      if (data) {
        remoteStreamsRef.current.set(socketId, { ...data, isDeafened });
        updateStreamsList();
      }
    });

    socket.on('video_status', ({ socketId, isVideoOn }: { socketId: string; isVideoOn: boolean }) => {
      const data = remoteStreamsRef.current.get(socketId);
      if (data) {
        remoteStreamsRef.current.set(socketId, { ...data, isVideoOn });
        updateStreamsList();
      }
    });

    socket.on('screen_status', ({ socketId, isScreenSharing }: { socketId: string; isScreenSharing: boolean }) => {
      const data = remoteStreamsRef.current.get(socketId);
      if (data) {
        remoteStreamsRef.current.set(socketId, { ...data, isScreenSharing });
        updateStreamsList();
      }
    });

    socket.on('incoming_call', onIncomingCall);
    socket.on('call:accepted', onCallAccepted);
    socket.on('call:declined', onCallDeclined);
    socket.on('call_full', onCallFull);
    socket.on('user_joined_call', onUserJoined);
    socket.on('webrtc_offer', onOffer);
    socket.on('webrtc_answer', onAnswer);
    socket.on('webrtc_ice', onIce);
    socket.on('user_left_call', onUserLeft);

    return () => {
      socket.off('incoming_call', onIncomingCall);
      socket.off('call:accepted', onCallAccepted);
      socket.off('call:declined', onCallDeclined);
      socket.off('call_full', onCallFull);
      socket.off('user_joined_call', onUserJoined);
      socket.off('webrtc_offer', onOffer);
      socket.off('webrtc_answer', onAnswer);
      socket.off('webrtc_ice', onIce);
      socket.off('user_left_call', onUserLeft);
    };
  }, [socket, user, createPeerConnection]);

  // ── Public methods ────────────────────────────────────────────────────────

  const inviteToCall = (roomId: string, targetUserIds: number[]) => {
    if (!socket) return;
    console.log('[Call] Inviting users', targetUserIds, 'to room', roomId);
    socket.emit('call:invite', { roomId, targetUserIds });
  };

  const joinCall = async (roomId: string) => {
    try {
      console.log('[WebRTC] Requesting microphone...');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      console.log('[WebRTC] Microphone granted');
      localStreamRef.current = stream;
      setLocalStream(stream);

      // Setup audio analysis for speaking indicator
      const audioCtx = new AudioContext();
      const source = audioCtx.createMediaStreamSource(stream);
      const analyzer = audioCtx.createAnalyser();
      analyzer.fftSize = 256;
      source.connect(analyzer);
      audioContextRef.current = audioCtx;
      analyzerRef.current = analyzer;

      const bufferLength = analyzer.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      const checkSpeaking = () => {
        if (!analyzerRef.current) return;
        analyzerRef.current.getByteFrequencyData(dataArray);
        const average = dataArray.reduce((prev, curr) => prev + curr, 0) / bufferLength;
        const speaking = average > 10; // threshold

        if (speaking !== speakingRef.current) {
          speakingRef.current = speaking;
          setLocalSpeaking(speaking);
          socket?.emit('speaking', { roomId, isSpeaking: speaking });
        }
        requestAnimationFrame(checkSpeaking);
      };
      requestAnimationFrame(checkSpeaking);

      setActiveCallRoom(roomId);
      socket?.emit('join_call', { roomId });
      console.log('[WebRTC] join_call emitted for room', roomId);
    } catch (err) {
      console.error('[WebRTC] getUserMedia failed:', err);
      alert('Microphone access is required for voice calls. Please allow microphone access and try again.');
    }
  };

  const acceptCall = async (incoming: IncomingCall) => {
    console.log('[Call] Accepting call from', incoming.callerName);
    socket?.emit('call:accept', { roomId: incoming.roomId, callerId: incoming.callerId });
    setIncomingCall(null);
    await joinCall(incoming.roomId);
  };

  const declineCall = (incoming: IncomingCall) => {
    console.log('[Call] Declining call from', incoming.callerName);
    socket?.emit('call:decline', { roomId: incoming.roomId, callerId: incoming.callerId });
    setIncomingCall(null);
  };

  const leaveCall = () => {
    if (activeCallRoom) {
      console.log('[Call] Leaving room', activeCallRoom);
      socket?.emit('leave_call', { roomId: activeCallRoom });
      cleanupCall();
    }
  };

  const toggleMute = () => {
    if (localStreamRef.current) {
      const newState = !isMuted;
      localStreamRef.current.getAudioTracks().forEach(t => { t.enabled = !newState; });
      setIsMuted(newState);
      socket?.emit('mute_status', { roomId: activeCallRoom, isMuted: newState });
    }
  };

  const toggleDeafen = () => {
    const newState = !isDeafened;
    setIsDeafened(newState);
    // If deafening, also mute
    if (newState && !isMuted) {
      toggleMute();
    } else if (!newState && isMuted) {
      // Logic for un-deafening (optional: should it unmute too? Discord does sometimes)
    }
    socket?.emit('deafen_status', { roomId: activeCallRoom, isDeafened: newState });
  };

  const toggleVideo = async () => {
    if (!localStreamRef.current) return;
    try {
      if (isVideoOn) {
        const videoTrack = localStreamRef.current.getVideoTracks().find(t => t.kind === 'video' && !t.label.toLowerCase().includes('screen'));
        if (videoTrack) {
          videoTrack.stop();
          localStreamRef.current.removeTrack(videoTrack);
          
          peersRef.current.forEach(async (pc, targetSocketId) => {
            const sender = pc.getSenders().find(s => s.track === videoTrack);
            if (sender) {
              pc.removeTrack(sender);
              try {
                const offer = await pc.createOffer();
                await pc.setLocalDescription(offer);
                socket?.emit('webrtc_offer', { to: targetSocketId, offer, avatarUrl: (user as any)?.avatarUrl || null });
              } catch(e) { console.error('[WebRTC] Peer removed-track renegotiation failed', e); }
            }
          });
        }
        setIsVideoOn(false);
        socket?.emit('video_status', { roomId: activeCallRoom, isVideoOn: false });
        setLocalStream(new MediaStream(localStreamRef.current.getTracks()));
      } else {
        const newStream = await navigator.mediaDevices.getUserMedia({ video: true });
        const videoTrack = newStream.getVideoTracks()[0];
        localStreamRef.current.addTrack(videoTrack);
        setIsVideoOn(true);
        
        peersRef.current.forEach(async (pc, targetSocketId) => {
          pc.addTrack(videoTrack, localStreamRef.current!);
          try {
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            socket?.emit('webrtc_offer', { to: targetSocketId, offer, avatarUrl: (user as any)?.avatarUrl || null });
          } catch(e) { console.error('[WebRTC] Peer added-track renegotiation failed', e); }
        });
        
        socket?.emit('video_status', { roomId: activeCallRoom, isVideoOn: true });
        setLocalStream(new MediaStream(localStreamRef.current.getTracks()));
      }
    } catch (e) {
      console.error('[WebRTC] Failed toggling video:', e);
    }
  };

  const toggleScreenShare = async () => {
    if (!localStreamRef.current) return;
    try {
      if (isScreenSharing) {
        const tracks = localStreamRef.current.getVideoTracks();
        if (tracks.length > (isVideoOn ? 1 : 0)) {
          const track = tracks[tracks.length - 1]; // Assume last video track is screen sharing context
          track.stop();
          localStreamRef.current.removeTrack(track);
          
          peersRef.current.forEach(async (pc, targetSocketId) => {
            const sender = pc.getSenders().find(s => s.track === track);
            if (sender) {
              pc.removeTrack(sender);
              try {
                const offer = await pc.createOffer();
                await pc.setLocalDescription(offer);
                socket?.emit('webrtc_offer', { to: targetSocketId, offer, avatarUrl: (user as any)?.avatarUrl || null });
              } catch(e) {}
            }
          });
        }
        setIsScreenSharing(false);
        socket?.emit('screen_status', { roomId: activeCallRoom, isScreenSharing: false });
        setLocalStream(new MediaStream(localStreamRef.current.getTracks()));
      } else {
        const displayStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
        const screenTrack = displayStream.getVideoTracks()[0];
        
        screenTrack.onended = () => {
          setIsScreenSharing(false);
          socket?.emit('screen_status', { roomId: activeCallRoom, isScreenSharing: false });
          if (localStreamRef.current) {
            localStreamRef.current.removeTrack(screenTrack);
            peersRef.current.forEach(async (pc, targetSocketId) => {
               const sender = pc.getSenders().find(s => s.track === screenTrack);
               if (sender) {
                 pc.removeTrack(sender);
                 try {
                   const offer = await pc.createOffer();
                   await pc.setLocalDescription(offer);
                   socket?.emit('webrtc_offer', { to: targetSocketId, offer, avatarUrl: (user as any)?.avatarUrl || null });
                 } catch(e) {}
               }
            });
            setLocalStream(new MediaStream(localStreamRef.current.getTracks()));
          }
        };
        
        localStreamRef.current.addTrack(screenTrack);
        setIsScreenSharing(true);
        
        peersRef.current.forEach(async (pc, targetSocketId) => {
          pc.addTrack(screenTrack, localStreamRef.current!);
          try {
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            socket?.emit('webrtc_offer', { to: targetSocketId, offer, avatarUrl: (user as any)?.avatarUrl || null });
          } catch(e) {}
        });
        
        socket?.emit('screen_status', { roomId: activeCallRoom, isScreenSharing: true });
        setLocalStream(new MediaStream(localStreamRef.current.getTracks()));
      }
    } catch (e) {
      console.error('[WebRTC] Failed toggling screen share:', e);
    }
  };

  return (
    <WebRTCContext.Provider value={{
      activeCallRoom,
      isMuted,
      isDeafened,
      isVideoOn,
      isScreenSharing,
      incomingCall,
      remoteStreams: remoteStreamsList,
      inviteToCall,
      joinCall,
      acceptCall,
      declineCall,
      leaveCall,
      toggleMute,
      toggleDeafen,
      toggleVideo,
      toggleScreenShare,
      localSpeaking,
      localStream,
    }}>
      {children}
    </WebRTCContext.Provider>
  );
}
