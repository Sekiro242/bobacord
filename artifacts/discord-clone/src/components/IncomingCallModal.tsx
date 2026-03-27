import { useVoiceSFU } from "@/hooks/use-voice-sfu";
import { Phone, PhoneOff } from "lucide-react";
import { useEffect } from "react";
import { useLocation } from "wouter";

export function IncomingCallModal() {
  const { incomingCall, acceptCall, declineCall } = useVoiceSFU();
  const [, setLocation] = useLocation();

  const handleAccept = async () => {
    if (incomingCall) {
      const targetId = incomingCall.callerId;
      await acceptCall(incomingCall);
      setLocation(`/dm/${targetId}`);
    }
  };

  useEffect(() => {
    if (incomingCall) {
      // Logic for ringing sound could go here
      console.log("Ringing...");
    }
  }, [incomingCall]);

  if (!incomingCall) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
      <div className="bg-card border border-border/50 w-full max-w-sm rounded-[32px] p-8 shadow-2xl flex flex-col items-center text-center space-y-6 animate-in zoom-in-95 duration-300">
        <div className="relative">
          {incomingCall.callerAvatarUrl ? (
            <img src={incomingCall.callerAvatarUrl} alt={incomingCall.callerName} className="w-24 h-24 rounded-full object-cover animate-pulse border border-border/50 shadow-lg" />
          ) : (
            <div className="w-24 h-24 rounded-full bg-primary/20 flex items-center justify-center text-4xl font-bold text-primary animate-pulse">
              {incomingCall.callerName[0].toUpperCase()}
            </div>
          )}
          <div className="absolute -bottom-2 -right-2 bg-emerald-500 p-2 rounded-full border-4 border-card shadow-md">
            <Phone className="w-5 h-5 text-white animate-bounce" />
          </div>
        </div>

        <div className="space-y-2">
          <h2 className="text-2xl font-bold text-foreground line-clamp-1 px-4">
            {incomingCall.callerName}
          </h2>
          <p className="text-muted-foreground font-medium animate-pulse">
            Incoming Voice Call...
          </p>
        </div>

        <div className="flex gap-4 w-full px-4">
          <button
            onClick={() => declineCall(incomingCall)}
            className="flex-1 bg-destructive hover:bg-destructive/90 text-white py-4 rounded-2xl font-bold transition-all shadow-lg active:scale-95 flex items-center justify-center gap-2 group"
          >
            <PhoneOff className="w-5 h-5 group-hover:-rotate-12 transition-transform" />
            Decline
          </button>
          <button
            onClick={handleAccept}
            className="flex-1 bg-emerald-500 hover:bg-emerald-500/90 text-white py-4 rounded-2xl font-bold transition-all shadow-lg active:scale-95 flex items-center justify-center gap-2 group"
          >
            <Phone className="w-5 h-5 group-hover:rotate-12 transition-transform" />
            Accept
          </button>
        </div>
      </div>
    </div>
  );
}
