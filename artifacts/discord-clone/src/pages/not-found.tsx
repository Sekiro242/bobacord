import { Link } from "wouter";
import { AlertCircle, ChevronLeft } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center bg-[#020203] relative overflow-hidden">
      {/* Background Glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-primary/10 rounded-full blur-[120px] opacity-40 animate-pulse"></div>

      <div className="relative z-10 flex flex-col items-center text-center space-y-8 animate-boba-float">
        <div className="w-20 h-20 rounded-full bg-gradient-to-tr from-[#9167e4] to-[#f472b6] flex items-center justify-center border border-white/20 shadow-[0_0_50px_rgba(145,103,228,0.4)] overflow-hidden p-1">
           <img src="/logo.png" alt="BobaCord" className="w-full h-full object-cover rounded-full" />
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-center gap-3">
            <AlertCircle className="h-6 w-6 text-primary" />
            <h1 className="text-4xl font-black text-white tracking-tighter uppercase">Frequency Lost</h1>
          </div>
          <p className="text-white/20 text-xs font-bold uppercase tracking-[0.3em]">Code 404: The destination is outside the BobaCord network</p>
        </div>

        <Link href="/">
          <button className="flex items-center gap-2 px-8 py-4 bg-white/[0.03] border border-white/10 rounded-full text-white/40 hover:text-white hover:bg-white/10 transition-all font-black uppercase text-[10px] tracking-widest group">
            <ChevronLeft className="w-4 h-4 transition-transform group-hover:-translate-x-1" />
            Return to Core
          </button>
        </Link>
      </div>
    </div>
  );
}
