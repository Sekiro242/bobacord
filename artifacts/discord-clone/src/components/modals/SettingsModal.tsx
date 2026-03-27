import { useState } from "react";
import { X, Camera, Save, Loader2 } from "lucide-react";
import { useAuth, getAuthHeaders } from "@/hooks/use-auth";
import { useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";

interface SettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
    const { user } = useAuth();
    const queryClient = useQueryClient();
    const [username, setUsername] = useState(user?.username || "");
    const [avatarUrl, setAvatarUrl] = useState((user as any)?.avatarUrl || "");
    const [avatarFile, setAvatarFile] = useState<File | null>(null);
    const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
            setAvatarFile(file);
            setAvatarPreview(URL.createObjectURL(file));
        }
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSaving(true);
        setError(null);

        try {
            let finalAvatarUrl = avatarUrl;
            const headers = getAuthHeaders();

            // 1. Upload file if selected
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
                finalAvatarUrl = uploadData.avatarUrl;
            }

            // 2. Update profile text data (if changed or if purely URL was changed)
            if (username !== user?.username || (!avatarFile && avatarUrl !== (user as any)?.avatarUrl)) {
                const resp = await fetch("/api/users/profile", {
                    method: "PATCH",
                    headers: {
                        "Content-Type": "application/json",
                        ...headers,
                    } as HeadersInit,
                    body: JSON.stringify({ 
                        username, 
                        avatarUrl: avatarFile ? finalAvatarUrl : avatarUrl 
                    }),
                });

                if (!resp.ok) {
                    throw new Error("Failed to update profile");
                }
            }

            await queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
            onClose();
        } catch (err: any) {
            setError(err.message);
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                    <motion.div
                        initial={{ opacity: 0, scale: 0.95, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: 20 }}
                        className="bg-card w-full max-w-md rounded-2xl shadow-2xl overflow-hidden border border-border"
                    >
                        <div className="p-6 border-b border-border flex items-center justify-between bg-muted/30">
                            <h2 className="text-xl font-bold text-foreground">User Settings</h2>
                            <button
                                onClick={onClose}
                                className="text-muted-foreground hover:text-foreground transition-colors p-1"
                            >
                                <X className="w-6 h-6" />
                            </button>
                        </div>

                        <form onSubmit={handleSave} className="p-6 space-y-6">
                            {error && (
                                <div className="bg-destructive/10 text-destructive text-sm p-3 rounded-lg border border-destructive/20">
                                    {error}
                                </div>
                            )}

                            {/* Avatar Section */}
                            <div className="flex flex-col items-center gap-4">
                                <div className="relative group">
                                    <div className="w-24 h-24 rounded-full bg-primary/10 border-2 border-primary/20 flex items-center justify-center overflow-hidden shadow-inner">
                                        {avatarPreview || avatarUrl ? (
                                            <img src={avatarPreview || avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                                        ) : (
                                            <span className="text-3xl font-bold text-primary">
                                                {username[0]?.toUpperCase() || "?"}
                                            </span>
                                        )}
                                    </div>
                                    <label className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-full cursor-pointer">
                                        <Camera className="w-8 h-8 text-white" />
                                        <input type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
                                    </label>
                                </div>
                                <div className="w-full space-y-2">
                                    <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                                        Or Use Avatar URL
                                    </label>
                                    <input
                                        type="url"
                                        value={avatarUrl || ""}
                                        onChange={(e) => {
                                            setAvatarUrl(e.target.value);
                                            setAvatarPreview(null);
                                            setAvatarFile(null);
                                        }}
                                        placeholder="https://example.com/avatar.png"
                                        className="w-full bg-background border border-border rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all text-foreground"
                                    />
                                </div>
                            </div>

                            {/* Username Section */}
                            <div className="space-y-2">
                                <label className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
                                    Username
                                </label>
                                <input
                                    type="text"
                                    value={username}
                                    onChange={(e) => setUsername(e.target.value)}
                                    className="w-full bg-background border border-border rounded-lg px-4 py-2.5 focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all text-foreground"
                                    required
                                />
                            </div>

                            <div className="pt-4 flex gap-3">
                                <button
                                    type="button"
                                    onClick={onClose}
                                    className="flex-1 px-4 py-2.5 rounded-lg border border-border text-foreground font-medium hover:bg-muted transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    disabled={isSaving}
                                    className="flex-1 bg-primary text-primary-foreground px-4 py-2.5 rounded-lg font-medium hover:bg-primary/90 transition-all shadow-lg shadow-primary/20 flex items-center justify-center gap-2"
                                >
                                    {isSaving ? (
                                        <Loader2 className="w-5 h-5 animate-spin" />
                                    ) : (
                                        <>
                                            <Save className="w-5 h-5" />
                                            Save Changes
                                        </>
                                    )}
                                </button>
                            </div>
                        </form>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
}
