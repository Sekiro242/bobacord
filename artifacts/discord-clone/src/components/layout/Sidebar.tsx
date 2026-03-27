import { useState } from "react";
import { Link, useLocation } from "wouter";
import { Users, Hash, Plus, Settings, X, LogOut } from "lucide-react";
import { useGetGroups, useGetFriends, useCreateGroup } from "@workspace/api-client-react";
import { getAuthHeaders, useAuth } from "@/hooks/use-auth";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import { SettingsModal } from "../modals/SettingsModal";

export function Sidebar() {
  const [location] = useLocation();
  const { user, logout } = useAuth();
  const queryClient = useQueryClient();
  const [isCreatingGroup, setIsCreatingGroup] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [selectedFriendIds, setSelectedFriendIds] = useState<number[]>([]);

  const { data: friends } = useGetFriends({ request: { headers: getAuthHeaders() } });
  const { data: groups } = useGetGroups({ request: { headers: getAuthHeaders() } });

  const createGroupMutation = useCreateGroup({
    request: { headers: getAuthHeaders() },
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
      if (prev.length >= 9) return prev; // max 9 friends + self = 10 total
      return [...prev, id];
    });
  };

  return (
    <div className="w-64 h-screen bg-sidebar border-r border-sidebar-border flex flex-col shadow-2xl z-10">
      {/* Top Header */}
      <div className="h-14 border-b border-sidebar-border flex items-center px-4 shadow-sm bg-sidebar/50">
        <h1 className="font-bold text-foreground text-lg tracking-tight">Bobacord</h1>
      </div>

      <div className="flex-1 overflow-y-auto py-3 custom-scrollbar">
        {/* Friends Link */}
        <div className="px-2 mb-4">
          <Link
            href="/"
            className={cn(
              "flex items-center gap-3 px-3 py-2.5 rounded-md transition-all duration-200 group font-medium",
              location === "/"
                ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-sm"
                : "text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground"
            )}
          >
            <Users className="w-5 h-5" />
            Friends
          </Link>
        </div>

        {/* Direct Messages Section */}
        <div className="px-2 mb-6">
          <div className="px-3 mb-1 flex items-center justify-between text-xs font-bold text-sidebar-foreground uppercase tracking-wider">
            <span>Direct Messages</span>
          </div>
          <div className="space-y-0.5 mt-2">
            {friends?.map(friend => {
              const href = `/dm/${friend.id}`;
              const isActive = location === href;
              return (
                <Link
                  key={friend.id}
                  href={href}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2 rounded-md transition-all duration-200 group",
                    isActive
                      ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-sm"
                      : "text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground"
                  )}
                >
                  <div className="relative">
                    {friend.avatarUrl ? (
                      <img src={friend.avatarUrl} alt={friend.username} className="w-8 h-8 rounded-full object-cover shadow-sm bg-background border border-border/50" />
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold text-sm">
                        {friend.username[0].toUpperCase()}
                      </div>
                    )}
                    <div className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-emerald-500 border-2 border-sidebar rounded-full shadow-sm"></div>
                  </div>
                  <span className="truncate">{friend.username}</span>
                </Link>
              );
            })}
            {(!friends || friends.length === 0) && (
              <div className="px-3 py-2 text-sm text-sidebar-foreground/60 italic">No friends yet.</div>
            )}
          </div>
        </div>

        {/* Groups Section */}
        <div className="px-2">
          <div className="px-3 mb-1 flex items-center justify-between text-xs font-bold text-sidebar-foreground uppercase tracking-wider group">
            <span>Group Chats</span>
            <button
              onClick={() => setIsCreatingGroup(!isCreatingGroup)}
              className="text-sidebar-foreground hover:text-foreground transition-colors"
              title="Create Group"
            >
              {isCreatingGroup ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
            </button>
          </div>

          <AnimatePresence>
            {isCreatingGroup && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <form onSubmit={handleCreateGroup} className="px-3 py-2 space-y-2">
                  <input
                    autoFocus
                    value={newGroupName}
                    onChange={e => setNewGroupName(e.target.value)}
                    placeholder="Group name..."
                    className="w-full bg-background text-sm rounded-md px-2 py-1.5 border border-border focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary text-foreground"
                  />
                  {friends && friends.length > 0 && (
                    <div className="space-y-1">
                      <p className="text-xs text-sidebar-foreground/60">Add friends (max 2):</p>
                      {friends.map(f => (
                        <label key={f.id} className="flex items-center gap-2 cursor-pointer text-sm text-sidebar-foreground hover:text-foreground">
                          <input
                            type="checkbox"
                            checked={selectedFriendIds.includes(f.id)}
                            onChange={() => toggleFriend(f.id)}
                            disabled={!selectedFriendIds.includes(f.id) && selectedFriendIds.length >= 9}
                            className="rounded accent-primary"
                          />
                          {f.username}
                        </label>
                      ))}
                    </div>
                  )}
                  <button
                    type="submit"
                    disabled={createGroupMutation.isPending || !newGroupName.trim()}
                    className="w-full bg-primary text-primary-foreground py-1.5 rounded-md text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
                  >
                    {createGroupMutation.isPending ? "Creating..." : "Create Group"}
                  </button>
                </form>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="space-y-0.5 mt-2">
            {groups?.map(group => {
              const href = `/group/${group.id}`;
              const isActive = location === href;
              return (
                <Link
                  key={group.id}
                  href={href}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2 rounded-md transition-all duration-200 group",
                    isActive
                      ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-sm"
                      : "text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground"
                  )}
                >
                  <Hash className="w-5 h-5 opacity-60 group-hover:opacity-100" />
                  <span className="truncate">{group.name}</span>
                </Link>
              );
            })}
            {(!groups || groups.length === 0) && (
              <div className="px-3 py-2 text-sm text-sidebar-foreground/60 italic">No groups yet.</div>
            )}
          </div>
        </div>
      </div>

      {/* User Area */}
      <div className="p-3 bg-sidebar-border/30 border-t border-sidebar-border flex items-center justify-between">
        <div className="flex items-center gap-2 overflow-hidden">
          {user?.avatarUrl ? (
            <img src={user.avatarUrl} alt="Me" className="w-9 h-9 rounded-full object-cover shadow-sm bg-background border border-border/50 shrink-0" />
          ) : (
            <div className="w-9 h-9 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold shrink-0">
              {user?.username[0].toUpperCase()}
            </div>
          )}
          <div className="flex flex-col overflow-hidden">
            <span className="text-sm font-bold text-foreground truncate">{user?.username}</span>
            <span className="text-xs text-sidebar-foreground">Online</span>
          </div>
        </div>
        <div className="flex items-center gap-0.5">
          <button
            onClick={() => setIsSettingsOpen(true)}
            className="p-1.5 rounded-md text-sidebar-foreground hover:bg-sidebar-accent hover:text-foreground transition-colors shrink-0"
            title="User Settings"
          >
            <Settings className="w-4.5 h-4.5" />
          </button>
          <button
            onClick={logout}
            className="p-1.5 rounded-md text-sidebar-foreground hover:bg-sidebar-accent hover:text-destructive transition-colors shrink-0"
            title="Log out"
          >
            <LogOut className="w-4.5 h-4.5" />
          </button>
        </div>
      </div>

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />
    </div>
  );
}
