import { useState } from "react";
import { Link, useLocation } from "wouter";
import { Users, Hash, Plus, Settings, X, LogOut } from "lucide-react";
import { useGetGroups, useGetFriends, useCreateGroup } from "@workspace/api-client-react";
import { getAuthHeaders, useAuth } from "@/hooks/use-auth";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { SettingsModal } from "../modals/SettingsModal";
import { useSettings } from "@/hooks/use-settings";
import { useUnread } from "@/hooks/use-unread";
import { useEffect } from "react";
import { ProfilePopup } from "../chat/ProfilePopup";
import { useTyping } from "@/hooks/use-typing";
import { TypingIndicator } from "../ui/TypingIndicator";

export function Sidebar() {
  const [location] = useLocation();
  const { user, logout } = useAuth();
  const queryClient = useQueryClient();
  const { openSettings } = useSettings();
  const [isCreatingGroup, setIsCreatingGroup] = useState(false);
  // Removed local isSettingsOpen state
  const [newGroupName, setNewGroupName] = useState("");
  const [selectedFriendIds, setSelectedFriendIds] = useState<number[]>([]);
  const [selectedProfileId, setSelectedProfileId] = useState<number | null>(null);

  const { data: friends } = useGetFriends({ request: { headers: getAuthHeaders() as HeadersInit } });
  const { data: groups } = useGetGroups({ request: { headers: getAuthHeaders() as HeadersInit } });
  const { unreadCounts, setInitialCounts } = useUnread();
  const { getTypingUsers } = useTyping();

  // Initialize unread counts once data is loaded
  useEffect(() => {
    if (friends || groups) {
      const dmCounts: Record<number, number> = {};
      const groupCounts: Record<number, number> = {};
      friends?.forEach(f => { dmCounts[f.id] = (f as any).unreadCount || 0; });
      groups?.forEach(g => { groupCounts[g.id] = (g as any).unreadCount || 0; });
      setInitialCounts({ dm: dmCounts, group: groupCounts });
    }
  }, [friends, groups, setInitialCounts]);

  const createGroupMutation = useCreateGroup({
    request: { headers: getAuthHeaders() as HeadersInit },
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/groups"] });
        setIsCreatingGroup(false);
        setNewGroupName("");
        setSelectedFriendIds([]);
      }
    }
  });

  const handleCreateGroup = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGroupName.trim()) return;
    createGroupMutation.mutate({ data: { name: newGroupName.trim(), memberIds: selectedFriendIds } });
  };

  const toggleFriend = (id: number) => {
    setSelectedFriendIds(prev => {
      if (prev.includes(id)) return prev.filter(x => x !== id);
      if (prev.length >= 9) return prev;
      return [...prev, id];
    });
  };

  return (
    <div className="w-64 h-screen flex flex-col z-10 relative bg-[#040406]/95 backdrop-blur-3xl border-r border-white/[0.04]">
      {/* ── Brand Header ── */}
      <div className="h-14 flex items-center gap-3 px-5 shrink-0">
        <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-[#9167e4] to-[#f472b6] flex items-center justify-center shadow-[0_0_20px_rgba(145,103,228,0.45)] border border-white/20 overflow-hidden">
          <img src="/logo.png" alt="BobaCord" className="w-full h-full object-cover" />
        </div>
        <h1 className="font-extrabold text-[17px] tracking-tight text-white flex items-baseline">
          <span className="bg-clip-text text-transparent bg-gradient-to-r from-white via-white/90 to-white/60">Bobacord</span>
        </h1>
      </div>

      {/* Divider */}
      <div className="mx-4 h-px bg-white/[0.05]" />

      <div className="flex-1 overflow-y-auto py-4 px-2 flex flex-col gap-6">
        {/* ── Navigation ── */}
        <div className="space-y-0.5 px-1">
          <Link
            href="/"
            className={cn(
              "flex items-center gap-2.5 px-3 py-2 rounded-xl transition-all duration-200 text-sm font-semibold",
              location === "/"
                ? "bg-white/[0.07] text-white border border-white/[0.07]"
                : "text-white/50 hover:text-white/80 hover:bg-white/[0.04]"
            )}
          >
            <Users className="w-4 h-4 shrink-0" />
            Friends
          </Link>
        </div>

        {/* ── Direct Messages ── */}
        <div className="space-y-1.5">
          <div className="px-3 flex items-center justify-between mb-1">
            <span className="section-label">Direct Messages</span>
          </div>

          <div className="space-y-0.5 px-1">
            {friends?.map(friend => {
              const href = `/dm/${friend.id}`;
              const isActive = location === href;
                  const unread = unreadCounts.dm[friend.id] || 0;
                  const typingUsers = getTypingUsers("dm", friend.id);
                  return (
                    <Link
                      key={friend.id}
                      href={href}
                      className={cn(
                        "flex items-center justify-between px-3 py-2 rounded-xl transition-all duration-200 group relative",
                        isActive
                          ? "bg-primary/10 text-primary border border-primary/20"
                          : "text-white/50 hover:text-white/80 hover:bg-white/[0.04]"
                      )}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="relative shrink-0">
                          {(friend as any).avatarUrl ? (
                            <img
                              src={(friend as any).avatarUrl}
                              alt={friend.username}
                              className="w-7 h-7 rounded-full object-cover border border-white/10"
                            />
                          ) : (
                            <div className="w-7 h-7 rounded-full bg-white/[0.07] flex items-center justify-center text-white/50 font-semibold text-[11px] border border-white/10">
                              {friend.username[0].toUpperCase()}
                            </div>
                          )}
                          <div className="absolute -bottom-0.5 -right-0.5 status-dot-online w-2 h-2 border-[1.5px]" />
                        </div>
                        <span className="text-sm font-medium truncate">{friend.username}</span>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {typingUsers.length > 0 && (
                          <TypingIndicator size="sm" className="bg-transparent border-none px-0" />
                        )}
                        {unread > 0 && typingUsers.length === 0 && (
                          <div className="min-w-[18px] h-[18px] rounded-full bg-primary text-[10px] font-bold text-white flex items-center justify-center px-1 animate-badge-new">
                            {unread > 99 ? "99+" : unread}
                          </div>
                        )}
                      </div>
                    </Link>
                  );
                })}
          </div>
        </div>

        {/* Divider */}
        {friends && friends.length > 0 && groups && groups.length >= 0 && (
          <div className="mx-2 h-px bg-white/[0.04]" />
        )}

        {/* ── Group Chats ── */}
        <div className="space-y-1.5">
          <div className="px-3 flex items-center justify-between mb-1">
            <span className="section-label">Group Chats</span>
            <button
              onClick={() => setIsCreatingGroup(!isCreatingGroup)}
              title="Create group chat"
              className="text-white/30 hover:text-white/70 transition-colors p-0.5 rounded hover:bg-white/[0.06]"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>

          <AnimatePresence>
            {isCreatingGroup && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="px-1 mb-1"
              >
                <form onSubmit={handleCreateGroup} className="bg-white/[0.05] rounded-xl p-3 border border-white/[0.08] space-y-2.5">
                  <input
                    autoFocus
                    value={newGroupName}
                    onChange={e => setNewGroupName(e.target.value)}
                    placeholder="Group name..."
                    className="w-full bg-black/50 text-xs rounded-lg px-3 py-2 border border-white/[0.08] focus:outline-none focus:border-primary/40 text-white placeholder:text-white/25"
                  />
                  
                  {friends && friends.length > 0 && (
                    <div className="space-y-1 max-h-40 overflow-y-auto pr-1 custom-scrollbar">
                      <span className="text-[10px] uppercase tracking-wider font-bold text-white/20 px-1">Select Friends ({selectedFriendIds.length}/9)</span>
                      {friends.map(friend => {
                        const isSelected = selectedFriendIds.includes(friend.id);
                        return (
                          <div
                            key={friend.id}
                            onClick={() => toggleFriend(friend.id)}
                            className={cn(
                              "flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer transition-all border",
                              isSelected 
                                ? "bg-primary/20 border-primary/30 text-white" 
                                : "hover:bg-white/[0.05] border-transparent text-white/40 hover:text-white/60"
                            )}
                          >
                            <div className="relative shrink-0">
                              {(friend as any).avatarUrl ? (
                                <img src={(friend as any).avatarUrl} alt="" className="w-5 h-5 rounded-full object-cover" />
                              ) : (
                                <div className="w-5 h-5 rounded-full bg-white/10 flex items-center justify-center text-[9px] font-bold">
                                  {friend.username[0].toUpperCase()}
                                </div>
                              )}
                            </div>
                            <span className="text-[11px] font-medium truncate flex-1">{friend.username}</span>
                            <div className={cn(
                              "w-3.5 h-3.5 rounded border flex items-center justify-center transition-all",
                              isSelected ? "bg-primary border-primary" : "border-white/10"
                            )}>
                              {isSelected && <div className="w-1.5 h-1.5 rounded-sm bg-white" />}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  <div className="flex gap-2 pt-1">
                    <button
                      type="submit"
                      disabled={createGroupMutation.isPending || !newGroupName.trim()}
                      className="flex-1 bg-primary text-white py-1.5 rounded-lg text-xs font-semibold hover:bg-primary/85 disabled:opacity-40 transition-all"
                    >
                      Create
                    </button>
                    <button
                      type="button"
                      onClick={() => { setIsCreatingGroup(false); setNewGroupName(""); }}
                      className="px-2.5 py-1.5 rounded-lg text-white/30 hover:text-white/60 hover:bg-white/[0.05] transition-all"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </form>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="space-y-0.5 px-1">
            {groups?.map(group => {
              const href = `/group/${group.id}`;
              const isActive = location === href;
              const unread = unreadCounts.group[group.id] || 0;
              const typingUsers = getTypingUsers("group", group.id);
              return (
                <Link
                  key={group.id}
                  href={href}
                  className={cn(
                    "flex items-center justify-between px-3 py-2 rounded-xl transition-all duration-200 group",
                    isActive
                      ? "bg-violet-500/10 text-violet-400 border border-violet-500/20"
                      : "text-white/50 hover:text-white/80 hover:bg-white/[0.04]"
                  )}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-7 h-7 rounded-lg bg-white/[0.06] flex items-center justify-center border border-white/[0.08] group-hover:border-white/[0.14] transition-colors shrink-0">
                      <Hash className={cn("w-3.5 h-3.5 transition-opacity", isActive ? "opacity-100" : "opacity-40 group-hover:opacity-80")} />
                    </div>
                    <span className="text-sm font-medium truncate">{group.name}</span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {typingUsers.length > 0 && (
                      <TypingIndicator size="sm" className="bg-transparent border-none px-0" />
                    )}
                    {unread > 0 && typingUsers.length === 0 && (
                      <div className="min-w-[18px] h-[18px] rounded-full bg-violet-500 text-[10px] font-bold text-white flex items-center justify-center px-1 animate-badge-new">
                        {unread > 99 ? "99+" : unread}
                      </div>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Profile Rail ── */}
      <div className="border-t border-white/[0.05] bg-black/20 p-3">
        <div className="flex items-center justify-between px-2 py-1.5 rounded-xl hover:bg-white/[0.04] transition-all group">
          <div 
            onClick={() => setSelectedProfileId(user?.id || null)}
            className="flex items-center gap-2.5 min-w-0 cursor-pointer"
          >
            <div className="relative shrink-0">
              {(user as any)?.avatarUrl ? (
                <img
                  src={(user as any).avatarUrl}
                  alt="Me"
                  className="w-8 h-8 rounded-full object-cover border-2 border-primary/25"
                />
              ) : (
                <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold text-sm border-2 border-primary/20">
                  {user?.username[0].toUpperCase()}
                </div>
              )}
              <div className="absolute -bottom-0.5 -right-0.5 status-dot-online w-2.5 h-2.5 border-2" />
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-[13px] font-semibold text-white/90 truncate leading-tight">{user?.username}</span>
              <span className="text-[10px] text-white/40 leading-tight">Online</span>
            </div>
          </div>
          <div className="flex items-center gap-0.5">
            <button
              onClick={openSettings}
              title="Settings"
              className="p-1.5 rounded-lg text-white/30 hover:text-white hover:bg-white/[0.06] transition-all"
            >
              <Settings className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={logout}
              title="Sign out"
              className="p-1.5 rounded-lg text-white/30 hover:text-destructive hover:bg-destructive/5 transition-all"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      <ProfilePopup
        userId={selectedProfileId || 0}
        isOpen={selectedProfileId !== null}
        onClose={() => setSelectedProfileId(null)}
        onEdit={openSettings}
      />
    </div>
  );
}
