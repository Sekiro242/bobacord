import { useState } from "react";
import { Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { motion } from "framer-motion";
import { Eye, EyeOff, AlertCircle, Check } from "lucide-react";

export default function Register() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const { register, isRegistering } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      await register({ data: { username, password } });
    } catch (err: any) {
      setError(err.message || "Failed to create account.");
    }
  };

  // Password strength checks
  const checks = [
    { label: "At least 6 characters", pass: password.length >= 6 },
    { label: "Contains a number", pass: /\d/.test(password) },
  ];

  return (
    <div className="min-h-screen bg-[#020203] flex items-center justify-center p-4 relative overflow-hidden">
      {/* Ambient glow */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden opacity-40">
        <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] bg-primary/10 blur-[140px] rounded-full" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[450px] h-[450px] bg-violet-600/8 blur-[120px] rounded-full" />
      </div>

      <div className="w-full max-w-5xl z-10 flex items-center justify-between gap-16 px-8">
        {/* ── Register Card ── */}
        <motion.div
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="w-full max-w-[420px]"
        >
          <div className="bg-white/[0.03] backdrop-blur-3xl rounded-[32px] p-8 shadow-[0_32px_80px_rgba(0,0,0,0.5)] border border-white/[0.07] relative overflow-hidden">
            {/* Card top highlight */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-40 h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent" />

            <div className="relative z-10">
              {/* Header */}
              <div className="mb-8 text-center">
                <div className="w-12 h-12 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto mb-4">
                  <img src="/logo.png" alt="BobaCord" className="w-8 h-8 object-contain rounded-xl" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                </div>
                <h1 className="text-2xl font-bold text-white tracking-tight mb-1">Create an account</h1>
                <p className="text-white/45 text-[13px]">Join BobaCord today — it's free</p>
              </div>

              {/* Error */}
              {error && (
                <div className="mb-6 p-3.5 bg-destructive/8 border border-destructive/20 text-destructive/90 text-xs font-medium rounded-xl flex items-center gap-2.5 animate-slide-up">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Username */}
                <div className="space-y-1.5">
                  <label htmlFor="register-username" className="text-[11px] font-semibold text-white/55 uppercase tracking-[0.1em] ml-1">
                    Username
                  </label>
                  <input
                    id="register-username"
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    required
                    autoComplete="username"
                    placeholder="Choose a username"
                    className="w-full px-4 py-3 bg-black/35 border border-white/[0.08] rounded-xl text-white placeholder:text-white/20 focus:outline-none focus:border-primary/35 focus:bg-black/50 transition-all text-sm"
                  />
                </div>

                {/* Password */}
                <div className="space-y-1.5">
                  <label htmlFor="register-password" className="text-[11px] font-semibold text-white/55 uppercase tracking-[0.1em] ml-1">
                    Password
                  </label>
                  <div className="relative">
                    <input
                      id="register-password"
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      autoComplete="new-password"
                      placeholder="Create a password"
                      className="w-full px-4 py-3 pr-12 bg-black/35 border border-white/[0.08] rounded-xl text-white placeholder:text-white/20 focus:outline-none focus:border-primary/35 focus:bg-black/50 transition-all text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      title={showPassword ? "Hide password" : "Show password"}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-white/25 hover:text-white/55 transition-colors"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>

                  {/* Password strength hints */}
                  {password.length > 0 && (
                    <div className="mt-2 space-y-1 pl-1">
                      {checks.map(({ label, pass }) => (
                        <div key={label} className={`flex items-center gap-2 text-[11px] font-normal transition-colors ${pass ? "text-emerald-400/80" : "text-white/25"}`}>
                          <Check className={`w-3 h-3 transition-opacity ${pass ? "opacity-100" : "opacity-30"}`} />
                          {label}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Submit */}
                <button
                  id="register-submit"
                  type="submit"
                  disabled={isRegistering}
                  className="w-full py-3 px-6 bg-primary text-white font-semibold rounded-xl hover:bg-primary/90 transition-all duration-300 shadow-[0_8px_24px_rgba(139,92,246,0.25)] active:scale-[0.98] disabled:opacity-40 text-sm mt-2"
                >
                  {isRegistering ? "Creating account…" : "Create Account"}
                </button>
              </form>

              <div className="mt-6 text-center text-[12px] text-white/35">
                Already have an account?{" "}
                <Link href="/login" className="text-primary/80 hover:text-primary transition-colors font-medium">
                  Sign in
                </Link>
              </div>
            </div>
          </div>
        </motion.div>

        {/* ── Right branding ── */}
        <motion.div
          initial={{ opacity: 0, x: 30 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.7, ease: "easeOut", delay: 0.15 }}
          className="hidden lg:flex flex-col gap-8 max-w-sm shrink-0"
        >
          <h2 className="text-4xl font-extrabold text-white leading-tight tracking-tight">
            Everything you need<br />
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-primary to-violet-400">
              to stay connected.
            </span>
          </h2>

          <div className="space-y-5">
            {[
              { icon: "🎙️", title: "Voice Calls", desc: "Crystal-clear audio with low latency" },
              { icon: "🧋", title: "Group Chats", desc: "Create spaces for your friends" },
              { icon: "⚡", title: "Instant Messaging", desc: "Real-time messages, always in sync" },
            ].map((f) => (
              <div key={f.title} className="flex items-start gap-4">
                <div className="w-11 h-11 rounded-2xl bg-white/[0.04] border border-white/[0.07] flex items-center justify-center text-lg shrink-0">
                  {f.icon}
                </div>
                <div className="pt-0.5">
                  <div className="font-semibold text-white/85 text-[14px]">{f.title}</div>
                  <div className="text-[12px] text-white/35 mt-0.5">{f.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      </div>
    </div>
  );
}
