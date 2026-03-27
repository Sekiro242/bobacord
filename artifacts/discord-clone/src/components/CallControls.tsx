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
        className="flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 transition-all font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed"
        title={activeCallRoom !== null ? "Already in a call" : "Start voice call"}
      >
        <PhoneCall className="w-4 h-4" />
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
              "relative aspect-square rounded-xl bg-card border-2 flex flex-col items-center justify-center transition-all duration-200 overflow-hidden group",
              p.isSpeaking ? "border-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.3)]" : "border-transparent bg-secondary/50"
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
              <div className="absolute -bottom-1 -right-1 flex gap-1">
                {p.isMuted && (
                  <div className="bg-destructive p-1 rounded-full shadow-lg border-2 border-card">
                    <MicOff className="w-3 h-3 text-white" />
                  </div>
                )}
                {p.isDeafened && (
                  <div className="bg-destructive p-1 rounded-full shadow-lg border-2 border-card">
                    <Headphones className="w-3 h-3 text-white" />
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
      <div className="flex items-center justify-center gap-3 bg-card/50 backdrop-blur-md p-3 rounded-2xl border border-border/50 self-center">
        <button
          onClick={toggleMute}
          className={cn(
            "p-3 rounded-xl transition-all duration-200",
            isMuted
              ? "bg-destructive/20 text-destructive hover:bg-destructive/30"
              : "bg-secondary text-foreground hover:bg-secondary/80"
          )}
          title={isMuted ? "Unmute" : "Mute"}
        >
          {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
        </button>

        <button
          onClick={toggleDeafen}
          className={cn(
            "p-3 rounded-xl transition-all duration-200",
            isDeafened
              ? "bg-destructive/20 text-destructive hover:bg-destructive/30"
              : "bg-secondary text-foreground hover:bg-secondary/80"
          )}
          title={isDeafened ? "Undeafen" : "Deafen"}
        >
          {isDeafened ? <Headphones className="w-5 h-5" /> : <Headphones className="w-5 h-5 opacity-50" />}
        </button>

        <div className="w-px h-8 bg-border/50 mx-1" />

        <button
          onClick={leaveCall}
          className="p-3 rounded-xl bg-destructive text-white hover:bg-destructive/90 transition-all shadow-md group"
          title="Leave call"
        >
          <PhoneOff className="w-5 h-5 group-hover:rotate-12 transition-transform" />
        </button>
      </div>
    </div>
  );
}
