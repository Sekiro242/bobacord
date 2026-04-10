import { useVoiceSFU } from "@/hooks/use-voice-sfu";
import { Phone, PhoneOff } from "lucide-react";
import { useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useNotifications } from "@/hooks/use-notifications";

export function IncomingCallModal() {
  const { incomingCall, acceptCall, declineCall } = useVoiceSFU();
  const [, setLocation] = useLocation();
  const { playAlertSound } = useNotifications();

  const handleAccept = async () => {
    if (incomingCall) {
      const targetId = incomingCall.callerId;
      await acceptCall(incomingCall);
      setLocation(`/dm/${targetId}`);
    }
  };

  // Ring sound loop while the modal is open
  useEffect(() => {
    if (!incomingCall) return;
    playAlertSound(); // Play immediately
    const interval = setInterval(playAlertSound, 2500); // Ring every 2.5s
    return () => clearInterval(interval);
  }, [incomingCall, playAlertSound]);

  if (!incomingCall) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-xl animate-in fade-in duration-300 p-4">
      <div className="glass-panel w-full max-w-sm rounded-[40px] p-8 shadow-[0_30px_80px_rgba(0,0,0,0.8)] flex flex-col items-center text-center space-y-8 animate-in zoom-in-95 duration-500 overflow-hidden relative">
        {/* Decorative inner glow */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[200px] h-[200px] bg-primary/20 blur-[80px] rounded-full pointer-events-none"></div>

        <div className="relative z-10 w-28 h-28 flex items-center justify-center">
          <div className="absolute inset-0 bg-primary/20 rounded-full animate-ping opacity-75"></div>
          {incomingCall.callerAvatarUrl ? (
            <img src={incomingCall.callerAvatarUrl} alt={incomingCall.callerName} className="w-24 h-24 rounded-full object-cover relative z-10 border-2 border-primary/50 shadow-[0_0_30px_rgba(139,92,246,0.5)]" />
          ) : (
            <div className="w-24 h-24 rounded-full bg-background flex items-center justify-center text-4xl font-bold text-primary relative z-10 border-2 border-primary/50 shadow-[0_0_30px_rgba(139,92,246,0.5)]">
              {incomingCall.callerName[0].toUpperCase()}
            </div>
          )}
          <div className="absolute -bottom-2 -right-2 bg-emerald-500 p-2.5 rounded-full border-4 border-background shadow-lg z-20">
            <Phone className="w-5 h-5 text-white animate-pulse" />
          </div>
        </div>

        <div className="space-y-1.5 z-10">
          <h2 className="text-2xl font-bold text-white line-clamp-1 px-4">
            {incomingCall.callerName}
          </h2>
          <p className="text-white/45 font-medium text-sm">
            Incoming voice call…
          </p>
        </div>

        <div className="flex gap-3 w-full px-2 z-10">
          <button
            onClick={() => declineCall(incomingCall)}
            className="flex-1 bg-white/[0.05] border border-white/[0.08] hover:bg-destructive/10 hover:border-destructive/30 text-white/60 hover:text-destructive py-3.5 rounded-2xl font-semibold transition-all duration-200 active:scale-95 flex items-center justify-center gap-2 group text-sm"
          >
            <PhoneOff className="w-4 h-4 group-hover:-rotate-12 transition-transform" />
            Decline
          </button>
          <button
            onClick={handleAccept}
            className="flex-1 bg-emerald-500 text-white py-3.5 rounded-2xl font-semibold transition-all duration-200 shadow-[0_0_20px_rgba(16,185,129,0.35)] hover:bg-emerald-500/90 active:scale-95 flex items-center justify-center gap-2 group text-sm hover:scale-[1.02]"
          >
            <Phone className="w-4 h-4 group-hover:rotate-12 transition-transform" />
            Accept
          </button>
        </div>
      </div>
    </div>
  );
}
