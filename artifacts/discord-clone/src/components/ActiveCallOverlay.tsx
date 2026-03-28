import { useVoiceSFU } from "@/hooks/use-voice-sfu";
import { useAuth } from "@/hooks/use-auth";
import {
  Mic,
  MicOff,
  PhoneOff,
  Headphones,
  MonitorUp,
  Video,
  VideoOff,
  GripHorizontal,
  Monitor,
  Maximize2,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useRef, useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useLocation } from "wouter";

// ─── Shared participant list ──────────────────────────────────────────────────

interface Participant {
  socketId: string;
  userId: number | undefined;
  username: string;
  avatarUrl: string | null | undefined;
  /** Mic / remote audio stream */
  audioStream: MediaStream | null;
  /** Webcam video stream */
  videoStream: MediaStream | null;
  /** Screen share stream */
  screenStream: MediaStream | null;
  isSpeaking: boolean;
  isMuted: boolean;
  isDeafened: boolean;
  isVideoOn: boolean;
  isScreenSharing: boolean;
  isLocal: boolean;
}

function useParticipants(): Participant[] {
  const {
    localStream,
    localVideoStream,
    localScreenStream,
    localSpeaking,
    isMuted,
    isDeafened,
    isVideoOn,
    isScreenSharing,
    remoteStreams,
  } = useVoiceSFU();
  const { user } = useAuth();

  return [
    {
      socketId: "local",
      userId: user?.id,
      username: user?.username || "You",
      avatarUrl: (user as any)?.avatarUrl,
      audioStream: localStream,
      videoStream: localVideoStream,
      screenStream: localScreenStream,
      isSpeaking: localSpeaking,
      isMuted,
      isDeafened,
      isVideoOn,
      isScreenSharing,
      isLocal: true,
    },
    ...remoteStreams.map((rs) => ({
      socketId: rs.socketId,
      userId: rs.userId,
      username: rs.username,
      avatarUrl: rs.avatarUrl,
      audioStream: rs.audioStream,
      videoStream: rs.videoStream,
      screenStream: rs.screenStream,
      isSpeaking: rs.isSpeaking,
      isMuted: rs.isMuted,
      isDeafened: rs.isDeafened,
      isVideoOn: rs.isVideoOn,
      isScreenSharing: rs.isScreenSharing,
      isLocal: false,
    })),
  ];
}

// ─── VideoNode component ──────────────────────────────────────────────────────

function VideoNode({
  participant,
  iAmDeafened,
  className,
  hideName,
}: {
  participant: Participant;
  iAmDeafened: boolean;
  className?: string;
  hideName?: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const fullscreenVideoRef = useRef<HTMLVideoElement>(null);

  // Active video stream: screen share takes priority over camera
  const activeVideoStream = participant.screenStream ?? participant.videoStream ?? null;
  const showVideo = !!activeVideoStream;
  const isScreenShare = !!participant.screenStream;

  // Attach video stream to inline player
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.srcObject = activeVideoStream;
    }
  }, [activeVideoStream]);

  // Attach video stream to fullscreen player
  useEffect(() => {
    if (fullscreenVideoRef.current) {
      fullscreenVideoRef.current.srcObject = activeVideoStream;
    }
  }, [activeVideoStream, isFullscreen]);

  // Hidden muted audio element to keep stream alive (required by browsers)
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.srcObject = participant.audioStream;
      audioRef.current.muted = true;
      audioRef.current.volume = 0;
    }
  }, [participant.audioStream]);

  // Close fullscreen on Escape key
  useEffect(() => {
    if (!isFullscreen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setIsFullscreen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isFullscreen]);

  const speakingRing = participant.isSpeaking
    ? "ring-4 ring-emerald-500/80 shadow-[0_0_18px_rgba(16,185,129,0.4)]"
    : "";

  return (
    <>
      {/* Fullscreen Modal */}
      <AnimatePresence>
        {isFullscreen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] bg-black flex flex-col items-center justify-center"
          >
            {/* Header */}
            <div className="absolute top-0 left-0 right-0 h-12 flex items-center justify-between px-4 bg-gradient-to-b from-black/80 to-transparent z-10">
              <div className="flex items-center gap-2 text-white/80 text-sm font-medium">
                <Monitor className="w-4 h-4" />
                {participant.username}'s screen
              </div>
              <button
                onClick={() => setIsFullscreen(false)}
                className="p-2 rounded-lg hover:bg-white/10 transition-colors text-white/80 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Full-screen Video */}
            <video
              ref={fullscreenVideoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-contain"
              style={{ imageRendering: 'auto' }}
            />

            {/* Speaking indicator */}
            {participant.isSpeaking && (
              <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-emerald-500/20 border border-emerald-500/60 text-emerald-400 text-xs font-medium px-3 py-1.5 rounded-full flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                {participant.username} is speaking
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Inline Tile */}
      <div
        className={cn(
          "relative flex flex-col items-center justify-center group h-full",
          className
        )}
      >
        <audio ref={audioRef} autoPlay playsInline muted style={{ display: "none" }} />

        {showVideo ? (
          /* ── Video mode ─────────────────────────────────────────── */
          <div
            className={cn(
              "relative overflow-hidden bg-black/90 w-full h-full rounded-xl border-2 transition-all duration-200",
              participant.isSpeaking
                ? "border-emerald-500 shadow-[0_0_20px_rgba(16,185,129,0.35)]"
                : "border-white/5"
            )}
          >
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              // Smooth playback hints for the browser renderer
              style={{ imageRendering: 'auto', backfaceVisibility: 'hidden' }}
              className="w-full h-full object-cover"
            />

            {/* Screen share badge + fullscreen button */}
            {isScreenShare && (
              <div className="absolute top-2 left-2 right-2 flex items-center justify-between">
                <div className="bg-indigo-600/90 backdrop-blur-sm px-2 py-0.5 rounded-md text-xs font-semibold text-white flex items-center gap-1 border border-white/10">
                  <Monitor className="w-3 h-3" />
                  Screen
                </div>
                <button
                  onClick={() => setIsFullscreen(true)}
                  className="bg-black/60 hover:bg-black/80 backdrop-blur-sm border border-white/10 text-white p-1.5 rounded-md transition-all opacity-0 group-hover:opacity-100"
                  title="Fullscreen"
                >
                  <Maximize2 className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* Camera badge (no screen share) */}
            {!isScreenShare && participant.isScreenSharing && (
              <div className="absolute top-2 left-2 bg-indigo-600/90 backdrop-blur-sm px-2 py-0.5 rounded-md text-xs font-semibold text-white flex items-center gap-1 border border-white/10">
                <Monitor className="w-3 h-3" />
                Screen
              </div>
            )}

            {!hideName && (
              <div className="absolute bottom-3 left-3 bg-black/60 backdrop-blur-md px-3 py-1 rounded-lg text-xs font-medium max-w-[90%] truncate text-white border border-white/10 shadow-lg">
                {participant.username.split(" ")[0]}{" "}
                {participant.isLocal && "(You)"}
              </div>
            )}
          </div>
        ) : (
          /* ── Audio-only / avatar mode ────────────────────────────────── */
          <div className="relative flex flex-col items-center justify-center p-4">
            {participant.avatarUrl ? (
              <img
                src={participant.avatarUrl}
                alt={participant.username}
                className={cn(
                  "rounded-full object-cover transition-all duration-300 shadow-2xl w-24 h-24",
                  speakingRing
                )}
                draggable={false}
              />
            ) : (
              <div
                className={cn(
                  "rounded-full bg-[#1e1f22] border-2 border-white/5 flex items-center justify-center font-bold text-primary shadow-2xl transition-all duration-300 w-24 h-24 text-4xl",
                  speakingRing
                )}
              >
                {participant.username[0].toUpperCase()}
              </div>
            )}

            {/* Status badges */}
            <div className="absolute bottom-3 right-3 flex gap-1 z-10">
              {participant.isMuted && (
                <div className="bg-destructive p-1.5 rounded-full shadow-lg border-2 border-[#111214]">
                  <MicOff className="w-3.5 h-3.5 text-white" />
                </div>
              )}
              {participant.isDeafened && (
                <div className="bg-destructive p-1.5 rounded-full shadow-lg border-2 border-[#111214]">
                  <Headphones className="w-3.5 h-3.5 text-white" />
                </div>
              )}
            </div>

            {!hideName && (
              <div className="mt-4 bg-black/40 px-3 py-1 rounded-full text-sm font-medium text-white/90 border border-white/5">
                {participant.username.split(" ")[0]}{" "}
                {participant.isLocal && "(You)"}
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}

// ─── Inline Call UI (rendered inside ChatArea) ────────────────────────────────

export function InRoomCallUI() {
  const {
    isMuted,
    isDeafened,
    isVideoOn,
    isScreenSharing,
    isScreenSharing: _isSS,
    toggleMute,
    toggleDeafen,
    toggleVideo,
    toggleScreenShare,
    leaveCall,
  } = useVoiceSFU();
  const participants = useParticipants();

  return (
    <div
      className="w-full bg-[#111214] flex flex-col justify-between overflow-hidden relative shrink-0"
      style={{ minHeight: "350px", maxHeight: "60vh" }}
    >
      {/* Participants Grid */}
      <div
        className={cn(
          "flex-1 p-6 gap-4 custom-scrollbar",
          participants.length <= 4
            ? "flex items-center justify-center flex-wrap"
            : "grid grid-cols-3 auto-rows-fr overflow-y-auto w-full max-w-5xl mx-auto"
        )}
      >
        {participants.map((p) => {
          const hasVideo = p.isVideoOn || p.isScreenSharing;
          return (
            <VideoNode
              key={p.socketId}
              participant={p}
              iAmDeafened={isDeafened}
              className={
                participants.length <= 4 && hasVideo
                  ? "w-full max-w-2xl aspect-video"
                  : participants.length <= 4
                  ? "w-40"
                  : ""
              }
            />
          );
        })}
      </div>

      {/* Control Pill */}
      <div className="pb-6 pt-4 flex items-center justify-center gap-4 bg-gradient-to-t from-[#111214] to-transparent">
        <div className="bg-[#2b2d31] rounded-[24px] p-1.5 flex items-center shadow-2xl border border-white/5">
          {/* Mute */}
          <button
            id="call-toggle-mute"
            onClick={toggleMute}
            title={isMuted ? "Unmute" : "Mute"}
            className={cn(
              "p-4 rounded-[18px] transition-all hover:bg-[#3f4147] text-zinc-300 hover:text-white",
              isMuted && "text-[#f23f42] hover:bg-destructive/20 hover:text-[#f23f42]"
            )}
          >
            {isMuted ? <MicOff className="w-[22px] h-[22px]" /> : <Mic className="w-[22px] h-[22px]" />}
          </button>

          {/* Camera */}
          <button
            id="call-toggle-video"
            onClick={toggleVideo}
            title={isVideoOn ? "Turn off camera" : "Turn on camera"}
            className={cn(
              "p-4 rounded-[18px] transition-all hover:bg-[#3f4147] text-zinc-300 hover:text-white",
              isVideoOn
                ? "text-[#23a559] bg-[#23a559]/10 hover:bg-[#23a559]/20 hover:text-[#23a559]"
                : "text-zinc-500 hover:text-zinc-300"
            )}
          >
            {isVideoOn ? (
              <Video className="w-[22px] h-[22px]" />
            ) : (
              <VideoOff className="w-[22px] h-[22px]" />
            )}
          </button>

          {/* Screen share */}
          <button
            id="call-toggle-screen"
            onClick={toggleScreenShare}
            title={isScreenSharing ? "Stop sharing" : "Share screen"}
            className={cn(
              "p-4 rounded-[18px] transition-all hover:bg-[#3f4147] text-zinc-300 hover:text-white",
              isScreenSharing &&
                "text-[#23a559] bg-[#23a559]/10 hover:bg-[#23a559]/20 hover:text-[#23a559]"
            )}
          >
            <MonitorUp className="w-[22px] h-[22px]" />
          </button>

          {/* Deafen */}
          <button
            id="call-toggle-deafen"
            onClick={toggleDeafen}
            title={isDeafened ? "Undeafen" : "Deafen"}
            className={cn(
              "p-4 rounded-[18px] transition-all hover:bg-[#3f4147] text-zinc-300 hover:text-white",
              isDeafened && "text-[#f23f42] hover:bg-destructive/20 hover:text-[#f23f42]"
            )}
          >
            <Headphones className="w-[22px] h-[22px]" />
          </button>
        </div>

        {/* Disconnect */}
        <button
          id="call-disconnect"
          onClick={leaveCall}
          className="bg-[#f23f42] hover:bg-[#da373c] text-white p-4 px-8 rounded-[24px] shadow-2xl transition-all active:scale-95 flex justify-center items-center gap-2 group border border-white/10"
        >
          <PhoneOff className="w-[22px] h-[22px] group-hover:rotate-12 transition-transform" />
        </button>
      </div>
    </div>
  );
}

// ─── Floating Call Widget (visible when not viewing the call room) ────────────

export function FloatingCallWidget() {
  const { activeCallRoom, isDeafened, leaveCall } = useVoiceSFU();
  const { user } = useAuth();
  const [location] = useLocation();
  const participants = useParticipants();

  if (!activeCallRoom) return null;

  // Determine if we're already viewing the call room
  let isViewingCallRoom = false;
  if (activeCallRoom.startsWith("group_")) {
    isViewingCallRoom = location === `/group/${activeCallRoom.split("_")[1]}`;
  } else if (activeCallRoom.startsWith("dm_")) {
    const parts = activeCallRoom.split("_");
    if (parts.length === 3) {
      const targetId =
        parseInt(parts[1]) === user?.id ? parts[2] : parts[1];
      isViewingCallRoom = location === `/dm/${targetId}`;
    } else {
      isViewingCallRoom = location === `/dm/${parts[1]}`;
    }
  }

  if (isViewingCallRoom) return null;

  return (
    <motion.div
      drag
      dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
      dragElastic={0.1}
      dragMomentum={false}
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="fixed z-[100] right-8 bottom-8 w-72 bg-[#1e1f22] border border-[#313338] shadow-2xl rounded-2xl overflow-hidden flex flex-col"
    >
      {/* Header */}
      <div className="bg-[#2b2d31] px-4 py-3 flex items-center gap-2 cursor-move border-b border-[#111214]">
        <div className="w-2 h-2 rounded-full bg-[#23a559] shadow-[0_0_8px_rgba(35,165,89,0.8)]" />
        <span className="text-sm border-none font-bold text-zinc-200 flex-1">
          Voice Connected
        </span>
        <GripHorizontal className="w-4 h-4 text-zinc-500" />
      </div>

      {/* Mini grid */}
      <div className="grid grid-cols-2 gap-2 p-3 bg-[#111214] overflow-y-auto max-h-60 custom-scrollbar">
        {participants.map((p) => (
          <div
            key={p.socketId}
            className="aspect-square bg-[#2b2d31] rounded-xl border border-white/5 overflow-hidden"
          >
            <VideoNode
              participant={p}
              iAmDeafened={isDeafened}
              hideName
              className="w-full h-full [&_img]:w-14 [&_img]:h-14 [&>div>div:first-child]:w-14 [&>div>div:first-child]:h-14 [&>div>div:first-child]:text-xl"
            />
          </div>
        ))}
      </div>

      {/* Disconnect */}
      <div className="p-3 border-t border-[#111214] bg-[#2b2d31] flex gap-2">
        <button
          onClick={leaveCall}
          className="w-full py-2.5 bg-[#f23f42]/10 text-[#f23f42] hover:bg-[#f23f42] hover:text-white rounded-xl transition-all text-sm font-bold flex items-center justify-center gap-2"
        >
          <PhoneOff className="w-4 h-4" />
          Disconnect
        </button>
      </div>
    </motion.div>
  );
}
