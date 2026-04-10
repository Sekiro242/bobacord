import { useVoiceSFU } from "@/hooks/use-voice-sfu";
import { useAuth } from "@/hooks/use-auth";
import { Mic, MicOff, PhoneOff, PhoneCall, Headphones } from "lucide-react";
import { cn } from "@/lib/utils";
import { AudioPlayer } from "./AudioPlayer";

interface CallControlsProps {
  roomId: string;
  targetUserIds?: number[];
}

export function CallControls({ roomId, targetUserIds = [] }: CallControlsProps) {
  const {
    activeCallRoom, isMuted, isDeafened, remoteStreams,
    inviteToCall, joinCall, leaveCall, toggleMute, toggleDeafen,
    localSpeaking
  } = useVoiceSFU();
  const { user } = useAuth();

  const inThisCall = activeCallRoom === roomId;

  const handleJoinCall = async () => {
    if (targetUserIds.length > 0) {
      inviteToCall(roomId, targetUserIds);
    }
    await joinCall(roomId);
  };

  if (!inThisCall) {
    return (
      <button
        onClick={handleJoinCall}
        disabled={activeCallRoom !== null}
        className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-primary/15 text-primary hover:bg-primary/25 transition-all duration-300 font-bold text-sm disabled:opacity-50 disabled:cursor-not-allowed border border-primary/30 shadow-[0_0_15px_rgba(139,92,246,0.15)] hover:shadow-[0_0_25px_rgba(139,92,246,0.25)] hover:scale-[1.02] active:scale-[0.98]"
        title={activeCallRoom !== null ? "Already in a call" : "Start voice call"}
      >
        <PhoneCall className="w-4 h-4 animate-pulse" />
        Join Voice
      </button>
    );
  }

  // Current user + remote users
  const allParticipants = [
    {
      socketId: 'local',
      userId: user?.id,
      username: user?.username || 'You',
      avatarUrl: (user as any)?.avatarUrl,
      isSpeaking: localSpeaking,
      isMuted,
      isDeafened,
      isLocal: true
    },
    ...remoteStreams.map((rs: any) => ({
      ...rs,
      isLocal: false
    }))
  ];

  return (
    <div className="flex flex-col gap-4 w-full">
      {/* Hidden Audio Players */}
      {remoteStreams.map((rs: any) => (
        <AudioPlayer key={rs.socketId} stream={rs.stream} isDeafened={isDeafened} />
      ))}

      {/* Participant Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        {allParticipants.map((p) => (
          <div
            key={p.socketId}
            className={cn(
              "relative aspect-square rounded-[24px] glass flex flex-col items-center justify-center transition-all duration-300 overflow-hidden group",
              p.isSpeaking ? "border-primary/60 shadow-[0_0_25px_rgba(139,92,246,0.25)]" : "border-white/5 opacity-80 hover:opacity-100"
            )}
          >
            {/* Avatar Container */}
            <div className="relative">
              {p.avatarUrl ? (
                <img
                  src={p.avatarUrl}
                  alt={p.username}
                  className={cn(
                    "w-20 h-20 rounded-full object-cover transition-transform duration-300",
                    p.isSpeaking && "scale-110"
                  )}
                />
              ) : (
                <div className="w-20 h-20 rounded-full bg-primary/20 flex items-center justify-center text-2xl font-bold text-primary">
                  {p.username[0].toUpperCase()}
                </div>
              )}

              {/* Status Icons Overlay */}
              <div className="absolute -bottom-1 -right-1 flex gap-1.5">
                {p.isMuted && (
                  <div className="bg-destructive/90 backdrop-blur-md p-1.5 rounded-full shadow-[0_0_10px_rgba(239,68,68,0.5)] border border-white/20">
                    <MicOff className="w-3.5 h-3.5 text-white" />
                  </div>
                )}
                {p.isDeafened && (
                  <div className="bg-destructive/90 backdrop-blur-md p-1.5 rounded-full shadow-[0_0_10px_rgba(239,68,68,0.5)] border border-white/20">
                    <Headphones className="w-3.5 h-3.5 text-white" />
                  </div>
                )}
              </div>
            </div>

            <span className="mt-3 text-sm font-medium text-foreground truncate max-w-[90%] px-2">
              {p.username} {p.isLocal && "(You)"}
            </span>
          </div>
        ))}
      </div>

      {/* Control Bar */}
      <div className="flex items-center justify-center gap-3 glass backdrop-blur-2xl p-2 rounded-full border border-white/10 self-center shadow-2xl overflow-hidden relative">
        <div className="absolute inset-0 bg-primary/5 blur-2xl pointer-events-none"></div>
        <button
          onClick={toggleMute}
          className={cn(
            "p-3.5 rounded-full transition-all duration-300 hover:scale-105 active:scale-95 relative z-10",
            isMuted
              ? "bg-destructive/20 text-destructive hover:bg-destructive/30 border border-destructive/20"
              : "bg-white/5 text-foreground hover:bg-white/10"
          )}
          title={isMuted ? "Unmute" : "Mute"}
        >
          {isMuted ? <MicOff className="w-[22px] h-[22px]" /> : <Mic className="w-[22px] h-[22px]" />}
        </button>

        <button
          onClick={toggleDeafen}
          className={cn(
            "p-3.5 rounded-full transition-all duration-300 hover:scale-105 active:scale-95 relative z-10",
            isDeafened
              ? "bg-destructive/20 text-destructive hover:bg-destructive/30 border border-destructive/20"
              : "bg-white/5 text-foreground hover:bg-white/10"
          )}
          title={isDeafened ? "Undeafen" : "Deafen"}
        >
          <Headphones className={cn("w-[22px] h-[22px]", !isDeafened && "opacity-80")} />
        </button>

        <div className="w-px h-8 bg-white/10 mx-1 z-10" />

        <button
          onClick={leaveCall}
          className="p-3.5 px-6 rounded-full bg-destructive/90 text-white hover:bg-destructive transition-all duration-300 shadow-[0_0_15px_rgba(239,68,68,0.3)] hover:shadow-[0_0_25px_rgba(239,68,68,0.5)] group z-10 hover:scale-105 active:scale-95 border border-white/20"
          title="Leave call"
        >
          <PhoneOff className="w-[22px] h-[22px] group-hover:rotate-12 transition-transform" />
        </button>
      </div>
    </div>
  );
}
