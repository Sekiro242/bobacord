import { useState, useEffect } from "react";
import { X, Mail, Calendar, User as UserIcon } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth, getAuthHeaders } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";

interface UserProfile {
  id: number;
  username: string;
  avatarUrl: string | null;
  bio: string | null;
}

interface ProfilePopupProps {
  userId: number;
  isOpen: boolean;
  onClose: () => void;
  onEdit?: () => void;
}

export function ProfilePopup({ userId, isOpen, onClose, onEdit }: ProfilePopupProps) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const { user: currentUser } = useAuth();

  useEffect(() => {
    if (isOpen && userId) {
      const fetchProfile = async () => {
        setIsLoading(true);
        try {
          const resp = await fetch(`/api/users/${userId}`, {
            headers: getAuthHeaders() as HeadersInit,
          });
          if (resp.ok) {
            const data = await resp.json();
            setProfile(data);
          }
        } catch (err) {
          console.error("Failed to fetch profile:", err);
        } finally {
          setIsLoading(false);
        }
      };
      fetchProfile();
    } else if (!isOpen) {
      // Clear profile when closed to ensure fresh data next time
      setProfile(null);
      setIsLoading(true);
    }
  }, [isOpen, userId]);

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Popup */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 10 }}
            className="relative w-full max-w-[340px] bg-[#0c0c12] rounded-[24px] overflow-hidden shadow-[0_20px_50px_rgba(0,0,0,0.5)] border border-white/10"
          >
            {/* Banner Area */}
            <div className="h-20 bg-gradient-to-r from-primary/40 to-violet-600/40 relative">
               <button
                  onClick={onClose}
                  className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/20 backdrop-blur-md flex items-center justify-center text-white/50 hover:text-white transition-all border border-white/5"
                >
                  <X className="w-4 h-4" />
                </button>
            </div>

            {/* Avatar - Overlapping banner */}
            <div className="px-5 -mt-10 relative z-10">
              <div className="relative inline-block">
                <div className="w-20 h-20 rounded-full bg-[#0c0c12] p-1.5 ring-1 ring-white/10 shadow-2xl">
                  {profile?.avatarUrl ? (
                    <img src={profile.avatarUrl} alt={profile.username} className="w-full h-full rounded-full object-cover" />
                  ) : (
                    <div className="w-full h-full rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold text-2xl">
                      {profile?.username?.[0]?.toUpperCase() || profile?.username?.[0] || "?"}
                    </div>
                  )}
                </div>
                <div className="absolute bottom-1.5 right-1.5 w-4 h-4 rounded-full bg-emerald-500 border-[3px] border-[#0c0c12]" />
              </div>
            </div>

            {/* Profile Info */}
            <div className="px-5 pt-4 pb-6 space-y-4">
              <div className="space-y-1">
                <h3 className="text-xl font-bold text-white tracking-tight">
                  {isLoading ? "Loading..." : profile?.username}
                </h3>
                <p className="text-xs text-white/40 font-medium">@{profile?.username?.toLowerCase().replace(/\s+/g, '_')}</p>
              </div>

              <div className="h-px bg-white/5" />

              <div className="space-y-3">
                <div className="space-y-1.5">
                  <h4 className="text-[10px] font-bold text-white/30 uppercase tracking-widest">About Me</h4>
                  <div className="text-sm text-white/70 leading-relaxed font-normal bg-white/5 rounded-xl p-3 border border-white/5">
                    {isLoading ? (
                      <div className="space-y-2">
                        <div className="h-3 w-full bg-white/5 animate-pulse rounded" />
                        <div className="h-3 w-2/3 bg-white/5 animate-pulse rounded" />
                      </div>
                    ) : profile?.bio || "No bio yet."}
                  </div>
                </div>

                <div className="h-px bg-white/5" />

                <div className="space-y-2">
                   <h4 className="text-[10px] font-bold text-white/30 uppercase tracking-widest">User Details</h4>
                   <div className="flex items-center gap-2.5 text-xs text-white/50">
                      <Mail className="w-3.5 h-3.5" />
                      <span>{profile?.username}@bobacord.com</span>
                   </div>
                   <div className="flex items-center gap-2.5 text-xs text-white/50">
                      <Calendar className="w-3.5 h-3.5" />
                      <span>Member since 2026</span>
                   </div>
                </div>
              </div>

              {userId === currentUser?.id ? (
                <div className="pt-2">
                  <button 
                    onClick={() => {
                      onClose();
                      onEdit?.();
                    }}
                    className="w-full bg-white/10 text-white py-2.5 rounded-xl text-xs font-bold hover:bg-white/15 transition-all border border-white/5"
                  >
                    Edit Profile
                  </button>
                </div>
              ) : (
                <div className="pt-2">
                  <button className="w-full bg-primary text-white py-2.5 rounded-xl text-xs font-bold hover:bg-primary/90 transition-all shadow-[0_0_15px_rgba(139,92,246,0.2)] hover:shadow-[0_0_20px_rgba(139,92,246,0.4)]">
                    Send Message
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
