import { useWebRTC } from "@/hooks/use-webrtc";
import { useAuth } from "@/hooks/use-auth";
import { Mic, MicOff, PhoneOff, Headphones, MonitorUp, Video, VideoOff, GripHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { useRef, useEffect } from "react";
import { motion } from "framer-motion";
import { useLocation, useLocation as useWouterLocation } from "wouter";

// Shared function to get all participants
function useParticipants() {
  const { localStream, localSpeaking, isMuted, isDeafened, isVideoOn, isScreenSharing, remoteStreams } = useWebRTC();
  const { user } = useAuth();
  
  return [
    {
      socketId: 'local',
      userId: user?.id,
      username: user?.username || 'You',
      avatarUrl: (user as any)?.avatarUrl,
      stream: localStream,
      isSpeaking: localSpeaking,
      isMuted,
      isDeafened,
      isVideoOn,
      isScreenSharing,
      isLocal: true
    },
    ...remoteStreams.map(rs => ({ ...rs, isLocal: false }))
  ];
}

function VideoNode({ participant, iAmDeafened, className, hideName }: { participant: any; iAmDeafened: boolean; className?: string; hideName?: boolean }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  
  useEffect(() => {
    if (videoRef.current && participant.stream) {
      videoRef.current.srcObject = participant.stream;
    }
    if (audioRef.current && participant.stream) {
      audioRef.current.srcObject = participant.stream;
    }
  }, [participant.stream, participant.isVideoOn, participant.isScreenSharing]);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.muted = participant.isLocal || iAmDeafened;
    }
    if (audioRef.current) {
      audioRef.current.muted = participant.isLocal || iAmDeafened;
    }
  }, [participant.isLocal, iAmDeafened]);

  const showVideo = participant.isVideoOn || participant.isScreenSharing;

  return (
    <div className={cn("relative flex flex-col items-center justify-center group h-full", className)}>
      <audio ref={audioRef} autoPlay playsInline style={{ display: 'none' }} />
      {showVideo ? (
        <div className={cn("relative overflow-hidden bg-black/80 w-full h-full", participant.isSpeaking ? "rounded-xl border-2 border-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.3)]" : "rounded-xl border-2 border-transparent")}>
          <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover" />
          {!hideName && (
            <div className="absolute bottom-3 left-3 bg-black/60 backdrop-blur-md px-3 py-1 rounded-lg text-xs font-medium max-w-[90%] truncate text-white border border-white/10 shadow-lg">
              {participant.username.split(" ")[0]} {participant.isLocal && "(You)"}
            </div>
          )}
        </div>
      ) : (
        <div className="relative flex flex-col items-center justify-center p-4">
          {participant.avatarUrl ? (
            <img
              src={participant.avatarUrl}
              alt={participant.username}
              className={cn(
                "rounded-full object-cover transition-transform duration-300 shadow-2xl w-24 h-24",
                participant.isSpeaking && "scale-105 ring-4 ring-emerald-500/80"
              )}
              draggable={false}
            />
          ) : (
            <div className={cn(
              "rounded-full bg-[#1e1f22] border-2 border-white/5 flex items-center justify-center font-bold text-primary shadow-2xl transition-transform duration-300 w-24 h-24 text-4xl",
              participant.isSpeaking && "scale-105 ring-4 ring-emerald-500/80"
            )}>
              {participant.username[0].toUpperCase()}
            </div>
          )}
          
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
               {participant.username.split(" ")[0]} {participant.isLocal && "(You)"}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Inline Call UI (For ChatArea)
export function InRoomCallUI() {
  const { isMuted, isDeafened, isVideoOn, isScreenSharing, toggleMute, toggleDeafen, toggleVideo, toggleScreenShare, leaveCall } = useWebRTC();
  const participants = useParticipants();

  return (
    <div className="w-full bg-[#111214] flex flex-col justify-between overflow-hidden relative shrink-0" style={{ minHeight: '350px', maxHeight: '60vh' }}>
      {/* Dynamic Participants Grid */}
      <div className={cn(
        "flex-1 p-6 gap-4 custom-scrollbar",
        participants.length <= 4 ? "flex items-center justify-center" : "grid grid-cols-3 auto-rows-fr overflow-y-auto w-full max-w-5xl mx-auto"
      )}>
        {participants.map(p => (
           <VideoNode 
             key={p.socketId} 
             participant={p} 
             iAmDeafened={isDeafened}
             className={participants.length <= 4 && (p.isVideoOn || p.isScreenSharing) ? "w-full max-w-xl aspect-video" : ""}
           />
        ))}
      </div>

      {/* Control Area - Discord Pill Style */}
      <div className="pb-6 pt-4 flex items-center justify-center gap-4 bg-gradient-to-t from-[#111214] to-transparent">
        {/* Container pill */}
        <div className="bg-[#2b2d31] rounded-[24px] p-1.5 flex items-center shadow-2xl border border-white/5">
          <button 
            onClick={toggleMute} 
            className={cn("p-4 rounded-[18px] transition-all hover:bg-[#3f4147] text-zinc-300 hover:text-white", isMuted && "text-[#f23f42] hover:bg-destructive/20 hover:text-[#f23f42]")}
          >
            {isMuted ? <MicOff className="w-[22px] h-[22px]" /> : <Mic className="w-[22px] h-[22px]" /> }
          </button>
          <button 
            onClick={toggleVideo} 
            className={cn("p-4 rounded-[18px] transition-all hover:bg-[#3f4147] text-zinc-300 hover:text-white", !isVideoOn && "text-[#f23f42] hover:bg-destructive/20 hover:text-[#f23f42]")}
          >
             {isVideoOn ? <Video className="w-[22px] h-[22px]" /> : <VideoOff className="w-[22px] h-[22px]" />}
          </button>
          <button 
            onClick={toggleScreenShare} 
            className={cn("p-4 rounded-[18px] transition-all hover:bg-[#3f4147] text-zinc-300 hover:text-white", isScreenSharing && "text-[#23a559] bg-[#23a559]/10 hover:bg-[#23a559]/20 hover:text-[#23a559]")}
          >
             <MonitorUp className="w-[22px] h-[22px]" />
          </button>
          <button 
            onClick={toggleDeafen} 
            className={cn("p-4 rounded-[18px] transition-all hover:bg-[#3f4147] text-zinc-300 hover:text-white", isDeafened && "text-[#f23f42] hover:bg-destructive/20 hover:text-[#f23f42]")}
          >
             {isDeafened ? <Headphones className="w-[22px] h-[22px]" /> : <Headphones className="w-[22px] h-[22px]" />}
          </button>
        </div>
        
        {/* Disconnect red pill */}
        <button 
          onClick={leaveCall} 
          className="bg-[#f23f42] hover:bg-[#da373c] text-white p-4 px-8 rounded-[24px] shadow-2xl transition-all active:scale-95 flex justify-center items-center gap-2 group border border-white/10"
        >
          <PhoneOff className="w-[22px] h-[22px] group-hover:rotate-12 transition-transform" />
        </button>
      </div>
    </div>
  );
}

// Floating Call Widget (For everywhere else)
export function FloatingCallWidget() {
  const { activeCallRoom, isDeafened, leaveCall } = useWebRTC();
  const { user } = useAuth();
  const [location] = useLocation();
  const participants = useParticipants();

  if (!activeCallRoom) return null;

  let isViewingCallRoom = false;
  if (activeCallRoom) {
    if (activeCallRoom.startsWith('group_')) {
      isViewingCallRoom = location === `/group/${activeCallRoom.split('_')[1]}`;
    } else if (activeCallRoom.startsWith('dm_')) {
      const parts = activeCallRoom.split('_');
      if (parts.length === 3) {
        const targetId = parseInt(parts[1]) === user?.id ? parts[2] : parts[1];
        isViewingCallRoom = location === `/dm/${targetId}`;
      } else {
        isViewingCallRoom = location === `/dm/${parts[1]}`;
      }
    }
  }

  if (isViewingCallRoom) return null; // Let ChatArea render InRoomCallUI

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
      <div className="bg-[#2b2d31] px-4 py-3 flex items-center gap-2 cursor-move border-b border-[#111214]">
        <div className="w-2 h-2 rounded-full bg-[#23a559] shadow-[0_0_8px_rgba(35,165,89,0.8)]" />
        <span className="text-sm border-none font-bold text-zinc-200 flex-1">Voice Connected</span>
        <GripHorizontal className="w-4 h-4 text-zinc-500" />
      </div>

      <div className="grid grid-cols-2 gap-2 p-3 bg-[#111214] overflow-y-auto max-h-60 custom-scrollbar">
        {participants.map((p) => (
          <div key={p.socketId} className="aspect-square bg-[#2b2d31] rounded-xl border border-white/5 overflow-hidden">
             <VideoNode 
               participant={p} 
               iAmDeafened={isDeafened} 
               hideName 
               className="w-full h-full [&_img]:w-14 [&_img]:h-14 [&>div>div:first-child]:w-14 [&>div>div:first-child]:h-14 [&>div>div:first-child]:text-xl" 
             />
          </div>
        ))}
      </div>

      <div className="p-3 border-t border-[#111214] bg-[#2b2d31] flex gap-2">
         <button onClick={leaveCall} className="w-full py-2.5 bg-[#f23f42]/10 text-[#f23f42] hover:bg-[#f23f42] hover:text-white rounded-xl transition-all text-sm font-bold flex items-center justify-center gap-2">
           <PhoneOff className="w-4 h-4" /> Disconnect
         </button>
      </div>
    </motion.div>
  );
}
