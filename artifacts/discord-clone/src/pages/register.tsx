import { useState } from "react";
import { Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { motion } from "framer-motion";

export default function Register() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const { register, isRegistering } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      await register({ data: { username, password } });
    } catch (err: any) {
      setError(err.message || "Failed to register");
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4 relative overflow-hidden">
      {/* Decorative background elements */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/20 rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-accent/20 rounded-full blur-[100px] pointer-events-none" />
      
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="w-full max-w-md bg-card border border-border p-8 rounded-2xl shadow-2xl shadow-black/50 z-10"
      >
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-foreground mb-2">Create an account</h1>
          <p className="text-muted-foreground">Join the conversation today.</p>
        </div>

        {error && (
          <div className="mb-6 p-3 bg-destructive/10 border border-destructive/20 text-destructive text-sm rounded-lg">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
              Username <span className="text-destructive">*</span>
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              className="w-full px-4 py-3 bg-input border-none rounded-md text-foreground focus:outline-none focus:ring-2 focus:ring-primary transition-all shadow-inner"
            />
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
              Password <span className="text-destructive">*</span>
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full px-4 py-3 bg-input border-none rounded-md text-foreground focus:outline-none focus:ring-2 focus:ring-primary transition-all shadow-inner"
            />
          </div>

          <button
            type="submit"
            disabled={isRegistering}
            className="w-full py-3 px-4 bg-primary text-primary-foreground font-bold rounded-md hover:bg-primary/90 transition-all hover:shadow-lg hover:shadow-primary/25 active:scale-[0.98] disabled:opacity-70 disabled:pointer-events-none"
          >
            {isRegistering ? "Creating account..." : "Continue"}
          </button>
        </form>

        <div className="mt-6 text-sm text-muted-foreground">
          <Link href="/login" className="text-primary hover:underline font-medium">
            Already have an account?
          </Link>
        </div>
      </motion.div>
    </div>
  );
}
