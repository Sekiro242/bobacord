import { useState, useEffect } from "react";
import { X, Camera, Save, Loader2, User, Palette, Shield } from "lucide-react";
import { useAuth, getAuthHeaders } from "@/hooks/use-auth";
import { useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type SettingsTab = "profile" | "appearance" | "account";

const tabs: { id: SettingsTab; label: string; icon: React.ElementType }[] = [
  { id: "profile", label: "Profile", icon: User },
  { id: "appearance", label: "Appearance", icon: Palette },
  { id: "account", label: "Account", icon: Shield },
];

export function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<SettingsTab>("profile");
  const [username, setUsername] = useState(user?.username || "");
  const [bio, setBio] = useState((user as any)?.bio || "");
  const [avatarUrl, setAvatarUrl] = useState((user as any)?.avatarUrl || "");
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // Sync local state with user data whenever the modal opens or user changes
  useEffect(() => {
    if (isOpen && user) {
      setUsername(user.username || "");
      setBio((user as any).bio || "");
      setAvatarUrl((user as any).avatarUrl || "");
      setAvatarFile(null);
      setAvatarPreview(null);
      setError(null);
      setSuccess(false);
    }
  }, [isOpen, user]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setAvatarFile(file);
      const url = URL.createObjectURL(file);
      setAvatarPreview(url);
      // Optional: store the url to revoke it later
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setError(null);
    setSuccess(false);

    try {
      const headers = getAuthHeaders();
      let currentAvatarUrl = avatarUrl;

      // 1. Handle Avatar Upload if a new file was selected
      if (avatarFile) {
        const formData = new FormData();
        formData.append("avatar", avatarFile);
        const uploadResp = await fetch("/api/users/avatar", {
          method: "POST",
          headers: headers as HeadersInit,
          body: formData,
        });
        if (!uploadResp.ok) throw new Error("Failed to upload image");
        const uploadData = await uploadResp.json();
        currentAvatarUrl = uploadData.avatarUrl;
        
        // Cleanup the object URL
        if (avatarPreview) URL.revokeObjectURL(avatarPreview);
        setAvatarPreview(null);
        setAvatarFile(null);
        setAvatarUrl(currentAvatarUrl);
      }

      // 2. Update Profile (Username/Bio/AvatarUrl) if anything changed
      const hasUsernameChanged = username !== user?.username;
      const hasBioChanged = bio !== ((user as any)?.bio || "");
      const hasAvatarUrlChanged = currentAvatarUrl !== ((user as any)?.avatarUrl || "");

      if (hasUsernameChanged || hasBioChanged || hasAvatarUrlChanged) {
        const resp = await fetch("/api/users/profile", {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            ...headers,
          } as HeadersInit,
          body: JSON.stringify({
            username,
            bio,
            avatarUrl: currentAvatarUrl,
          }),
        });
        
        if (!resp.ok) {
          const errorData = await resp.json();
          throw new Error(errorData.error || "Failed to update profile");
        }
      }

      // 3. Refresh user data
      await queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err: any) {
      console.error("Save error:", err);
      setError(err.message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/70 backdrop-blur-xl"
            onClick={onClose}
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.92, y: 30 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="relative w-full max-w-2xl rounded-[32px] overflow-hidden shadow-[0_40px_100px_rgba(0,0,0,0.8)] border border-white/10 bg-background/95 backdrop-blur-3xl flex flex-col max-h-[85vh]"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-8 py-5 border-b border-white/8 relative overflow-hidden shrink-0">
              <div className="absolute inset-0 bg-gradient-to-r from-primary/8 to-transparent pointer-events-none" />
              <div className="relative z-10">
                <h2 className="text-xl font-semibold text-white tracking-tight">Settings</h2>
                <p className="text-xs text-white/45 font-normal mt-0.5">Customize your Bobacord experience</p>
              </div>
              <button
                onClick={onClose}
                className="relative z-10 w-9 h-9 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-white/50 hover:text-white hover:bg-white/10 transition-all duration-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Body: Sidebar + Content */}
            <div className="flex flex-1 min-h-0">
              {/* Tab sidebar */}
              <div className="w-44 p-3 border-r border-white/5 shrink-0 flex flex-col gap-1 bg-black/10">
                {tabs.map(({ id, label, icon: Icon }) => (
                  <button
                    key={id}
                    onClick={() => setActiveTab(id)}
                    className={cn(
                      "flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 text-left w-full",
                      activeTab === id
                        ? "bg-primary/15 text-primary border border-primary/20 shadow-[0_0_12px_rgba(139,92,246,0.1)]"
                        : "text-white/50 hover:text-white hover:bg-white/5"
                    )}
                  >
                    <Icon className="w-4 h-4" />
                    {label}
                  </button>
                ))}
              </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto p-6">
                <AnimatePresence mode="wait">
                  {activeTab === "profile" && (
                    <motion.form
                      key="profile"
                      initial={{ opacity: 0, x: 12 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -12 }}
                      transition={{ duration: 0.2 }}
                      onSubmit={handleSave}
                      className="space-y-6"
                    >
                      {error && (
                        <div className="bg-destructive/10 text-destructive text-sm p-3.5 rounded-2xl border border-destructive/20 flex items-center gap-2">
                          <X className="w-4 h-4 shrink-0" />
                          {error}
                        </div>
                      )}

                      {success && (
                        <motion.div
                          initial={{ opacity: 0, y: -8 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="bg-emerald-500/10 text-emerald-400 text-sm p-3.5 rounded-2xl border border-emerald-500/20 flex items-center gap-2"
                        >
                          <Save className="w-4 h-4" />
                          Profile updated successfully!
                        </motion.div>
                      )}

                      {/* Avatar */}
                      <div className="flex flex-col items-center gap-5">
                        <div className="relative group">
                          <div className="w-24 h-24 rounded-full bg-primary/10 border-2 border-primary/25 flex items-center justify-center overflow-hidden shadow-[0_0_30px_rgba(139,92,246,0.15)] group-hover:border-primary/50 transition-all duration-300">
                            {avatarPreview || avatarUrl ? (
                              <img src={avatarPreview || avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                            ) : (
                              <span className="text-3xl font-black text-primary">
                                {username[0]?.toUpperCase() || "?"}
                              </span>
                            )}
                          </div>
                          <label className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-all duration-200 flex items-center justify-center rounded-full cursor-pointer backdrop-blur-sm">
                            <Camera className="w-7 h-7 text-white drop-shadow-lg" />
                            <input type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
                          </label>
                        </div>

                        <div className="w-full space-y-2">
                          <label className="text-[11px] font-semibold text-white/55 uppercase tracking-[0.1em]">
                            Avatar URL
                          </label>
                          <input
                            type="text"
                            value={avatarUrl || ""}
                            onChange={(e) => {
                              setAvatarUrl(e.target.value);
                              setAvatarPreview(null);
                              setAvatarFile(null);
                            }}
                            placeholder="https://example.com/avatar.png"
                            className="w-full bg-background/50 border border-white/10 rounded-2xl px-4 py-3 focus:outline-none focus:border-primary/50 focus:shadow-[0_0_15px_rgba(139,92,246,0.1)] transition-all text-white placeholder:text-white/20 text-sm"
                          />
                        </div>
                      </div>

                      {/* Username */}
                      <div className="space-y-2">
                        <label className="text-[11px] font-semibold text-white/55 uppercase tracking-[0.1em]">
                          Display Name
                        </label>
                        <input
                          type="text"
                          value={username}
                          onChange={(e) => setUsername(e.target.value)}
                          className="w-full bg-background/50 border border-white/10 rounded-2xl px-4 py-3 focus:outline-none focus:border-primary/50 focus:shadow-[0_0_15px_rgba(139,92,246,0.1)] transition-all text-white text-sm"
                          required
                        />
                      </div>

                      {/* Bio */}
                      <div className="space-y-2">
                        <label className="text-[11px] font-semibold text-white/55 uppercase tracking-[0.1em]">
                          About Me
                        </label>
                        <textarea
                          value={bio}
                          onChange={(e) => setBio(e.target.value)}
                          placeholder="Tell us about yourself..."
                          rows={3}
                          className="w-full bg-background/50 border border-white/10 rounded-2xl px-4 py-3 focus:outline-none focus:border-primary/50 focus:shadow-[0_0_15px_rgba(139,92,246,0.1)] transition-all text-white text-sm resize-none"
                        />
                      </div>

                      {/* Actions */}
                      <div className="pt-2 flex gap-3">
                        <button
                          type="button"
                          onClick={onClose}
                          className="flex-1 px-4 py-3 rounded-2xl border border-white/10 text-white/60 font-bold hover:bg-white/5 hover:text-white transition-all duration-200 text-sm"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          disabled={isSaving}
                          className="flex-1 bg-primary text-white px-4 py-3 rounded-2xl font-bold hover:bg-primary/90 transition-all duration-300 shadow-[0_0_15px_rgba(139,92,246,0.25)] hover:shadow-[0_0_25px_rgba(139,92,246,0.4)] flex items-center justify-center gap-2 text-sm hover:scale-[1.02] active:scale-[0.98]"
                        >
                          {isSaving ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <>
                              <Save className="w-4 h-4" />
                              Save Changes
                            </>
                          )}
                        </button>
                      </div>
                    </motion.form>
                  )}

                  {activeTab === "appearance" && (
                    <motion.div
                      key="appearance"
                      initial={{ opacity: 0, x: 12 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -12 }}
                      transition={{ duration: 0.2 }}
                      className="space-y-6"
                    >
                      <div className="text-center py-12">
                        <div className="w-16 h-16 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto mb-4">
                          <Palette className="w-7 h-7 text-primary/50" />
                        </div>
                        <h3 className="text-lg font-bold text-white/70 mb-1">Appearance Settings</h3>
                        <p className="text-white/30 text-sm">Theme customization coming soon.</p>
                      </div>
                    </motion.div>
                  )}

                  {activeTab === "account" && (
                    <motion.div
                      key="account"
                      initial={{ opacity: 0, x: 12 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -12 }}
                      transition={{ duration: 0.2 }}
                      className="space-y-6"
                    >
                      <div className="text-center py-12">
                        <div className="w-16 h-16 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto mb-4">
                          <Shield className="w-7 h-7 text-primary/50" />
                        </div>
                        <h3 className="text-lg font-bold text-white/70 mb-1">Account & Security</h3>
                        <p className="text-white/30 text-sm">Password and security settings coming soon.</p>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
