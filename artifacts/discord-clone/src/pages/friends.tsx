import { useState, useEffect } from "react";
import { Users, UserPlus, Check, X, Search, MessageSquare, Loader2, Clock, Sparkles } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetFriends,
  useGetFriendRequests,
  useSearchUsers,
  useSendFriendRequest,
  useAcceptFriendRequest,
} from "@workspace/api-client-react";
import { getAuthHeaders, useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import { Link } from "wouter";
import { useSocket } from "@/hooks/use-socket";
import { motion, AnimatePresence } from "framer-motion";

type Tab = "all" | "pending" | "add";

const tabConfig: { id: Tab; label: string; icon: React.ElementType }[] = [
  { id: "all", label: "All Friends", icon: Users },
  { id: "pending", label: "Pending", icon: Clock },
  { id: "add", label: "Add Friend", icon: UserPlus },
];

function UserAvatar({ name, size = "md" }: { name: string; size?: "sm" | "md" | "lg" }) {
  const sizeClasses = {
    sm: "w-8 h-8 text-[10px]",
    md: "w-10 h-10 text-xs",
    lg: "w-10 h-10 text-sm",
  };
  return (
    <div
      className={cn(
        "rounded-full flex items-center justify-center font-semibold bg-white/[0.06] border border-white/[0.08] text-white/50",
        sizeClasses[size]
      )}
    >
      {name[0].toUpperCase()}
    </div>
  );
}

export default function FriendsPage() {
  const [activeTab, setActiveTab] = useState<Tab>("all");
  const queryClient = useQueryClient();
  const { socket } = useSocket();
  const { user } = useAuth();

  useEffect(() => {
    if (!socket) return;
    const onFriendRequest = () => {
      queryClient.invalidateQueries({ queryKey: ["/api/friends/requests"] });
    };
    const onFriendAccept = () => {
      queryClient.invalidateQueries({ queryKey: ["/api/friends/requests"] });
      queryClient.invalidateQueries({ queryKey: ["/api/friends"] });
    };
    socket.on("friend_request_received", onFriendRequest);
    socket.on("friend_request_sent", onFriendRequest);
    socket.on("friend_request_accepted", onFriendAccept);
    return () => {
      socket.off("friend_request_received", onFriendRequest);
      socket.off("friend_request_sent", onFriendRequest);
      socket.off("friend_request_accepted", onFriendAccept);
    };
  }, [socket, queryClient]);

  const { data: friends } = useGetFriends({ request: { headers: getAuthHeaders() as HeadersInit } });
  const { data: requests } = useGetFriendRequests({ request: { headers: getAuthHeaders() as HeadersInit } });

  const acceptMutation = useAcceptFriendRequest({
    request: { headers: getAuthHeaders() as HeadersInit },
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/friends/requests"] });
        queryClient.invalidateQueries({ queryKey: ["/api/friends"] });
      }
    }
  });

  return (
    <div className="flex-1 flex flex-col bg-[#040406] h-screen overflow-hidden relative">
      {/* Background ambient glow */}
      <div className="absolute inset-0 pointer-events-none opacity-15 overflow-hidden">
        <div className="absolute top-[-10%] right-[-10%] w-[50%] h-[50%] bg-primary/20 blur-[120px] rounded-full" />
        <div className="absolute bottom-[-10%] left-[-10%] w-[50%] h-[50%] bg-violet-600/10 blur-[120px] rounded-full" />
      </div>

      {/* ── Top Bar ── */}
      <div className="h-14 shrink-0 border-b border-white/[0.04] bg-black/30 backdrop-blur-xl z-20 flex items-center gap-0 px-6">
        {/* Title */}
        <div className="flex items-center gap-2.5 pr-5 border-r border-white/[0.06]">
          <div className="w-7 h-7 rounded-full bg-primary/15 flex items-center justify-center border border-primary/20">
            <Users className="w-3.5 h-3.5 text-primary" />
          </div>
          <span className="font-semibold text-white/90 text-[15px]">Friends</span>
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-0.5 ml-4">
          {tabConfig.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={cn(
                "flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-[12px] font-medium transition-all duration-200",
                activeTab === id
                  ? "bg-white/[0.07] text-white/90 border border-white/[0.08]"
                  : "text-white/40 hover:text-white/65 hover:bg-white/[0.04]"
              )}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{label}</span>
              {id === "pending" && requests && requests.length > 0 && (
                <span className="min-w-[17px] h-[17px] rounded-full bg-primary text-white text-[9px] font-bold flex items-center justify-center px-1 animate-badge-new">
                  {requests.length}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ── Content ── */}
      <div className="flex-1 overflow-y-auto px-6 py-8 relative z-10">
        <AnimatePresence mode="wait">

          {/* All Friends */}
          {activeTab === "all" && (
            <motion.div
              key="all"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.2 }}
              className="max-w-2xl mx-auto"
            >
              <div className="flex items-center gap-4 mb-6">
                <span className="section-label">All Friends — {friends?.length || 0}</span>
                <div className="flex-1 h-px bg-white/[0.05]" />
              </div>

              <div className="space-y-1">
                {friends?.map((friend, i) => (
                  <motion.div
                    key={friend.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.04 }}
                    className="group flex items-center justify-between px-4 py-3 rounded-xl border border-transparent hover:border-white/[0.06] hover:bg-white/[0.03] transition-all duration-200"
                  >
                    <div className="flex items-center gap-3">
                      <div className="relative">
                        <UserAvatar name={friend.username} size="lg" />
                        <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-500 border-2 border-[#040406] rounded-full" />
                      </div>
                      <div>
                        <div className="font-semibold text-white/90 text-[14px]">{friend.username}</div>
                        <div className="text-[11px] text-white/35 mt-0.5 flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
                          Online
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Link
                        href={`/dm/${friend.id}`}
                        title="Send message"
                        className="w-9 h-9 rounded-full bg-white/[0.05] text-white/40 border border-white/[0.08] flex items-center justify-center hover:bg-primary/20 hover:text-primary hover:border-primary/25 transition-all duration-200"
                      >
                        <MessageSquare className="w-4 h-4" />
                      </Link>
                    </div>
                  </motion.div>
                ))}

                {(!friends || friends.length === 0) && (
                  <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
                    <div className="w-16 h-16 rounded-full bg-white/[0.03] border border-white/[0.06] flex items-center justify-center">
                      <Users className="w-7 h-7 text-white/15" />
                    </div>
                    <div className="space-y-1">
                      <h3 className="text-base font-semibold text-white/45">No friends yet</h3>
                      <p className="text-sm text-white/25">Add some friends to get started!</p>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {/* Pending Requests */}
          {activeTab === "pending" && (
            <motion.div
              key="pending"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.2 }}
              className="max-w-2xl mx-auto"
            >
              <div className="flex items-center gap-4 mb-6">
                <span className="section-label">Pending Requests — {requests?.length || 0}</span>
                <div className="flex-1 h-px bg-white/[0.05]" />
              </div>

              <div className="space-y-1">
                {requests?.map((req, i) => (
                  <motion.div
                    key={req.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.04 }}
                    className="group flex items-center justify-between px-4 py-3 rounded-xl border border-white/[0.04] hover:border-primary/20 hover:bg-white/[0.02] transition-all duration-200"
                  >
                    <div className="flex items-center gap-3">
                      <UserAvatar name={req.senderId === user?.id ? (req.receiver?.username || "?") : (req.sender?.username || "?")} size="lg" />
                      <div>
                        <div className="font-semibold text-white/90 text-[14px]">
                          {req.senderId === user?.id ? req.receiver?.username : req.sender?.username}
                        </div>
                        <div className="text-[11px] text-white/35 mt-0.5">
                          {req.senderId === user?.id ? "Outgoing friend request" : "Incoming friend request"}
                        </div>
                      </div>
                    </div>

                    <div className="flex gap-2">
                     {req.receiverId === user?.id ? (
                      <>
                      <button
                        onClick={() => acceptMutation.mutate({ data: { requestId: req.id } })}
                        disabled={acceptMutation.isPending}
                        title="Accept request"
                        className="h-9 px-5 rounded-xl bg-primary/10 text-primary border border-primary/20 hover:bg-primary hover:text-white transition-all duration-200 text-xs font-semibold disabled:opacity-40 flex items-center gap-1.5"
                      >
                        <Check className="w-3.5 h-3.5" />
                        Accept
                      </button>
                      <button
                        title="Decline request"
                        className="w-9 h-9 rounded-xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-center text-white/30 hover:text-destructive hover:bg-destructive/10 hover:border-destructive/20 transition-all"
                      >
                        <X className="w-4 h-4" />
                      </button>
                      </>
                     ) : (
                      <button
                        title="Cancel request"
                        className="h-9 px-4 rounded-xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-center text-white/40 hover:text-destructive hover:bg-destructive/10 hover:border-destructive/20 transition-all text-xs font-medium"
                      >
                        Cancel
                      </button>
                     )}
                    </div>
                  </motion.div>
                ))}

                {(!requests || requests.length === 0) && (
                  <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
                    <div className="w-16 h-16 rounded-full bg-white/[0.03] border border-white/[0.06] flex items-center justify-center">
                      <Clock className="w-7 h-7 text-white/15" />
                    </div>
                    <div className="space-y-1">
                      <h3 className="text-base font-semibold text-white/45">No pending requests</h3>
                      <p className="text-sm text-white/25">You're all caught up!</p>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {/* Add Friend */}
          {activeTab === "add" && (
            <motion.div
              key="add"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.2 }}
              className="max-w-2xl mx-auto"
            >
              <AddFriendTab />
            </motion.div>
          )}

        </AnimatePresence>
      </div>
    </div>
  );
}

function AddFriendTab() {
  const [search, setSearch] = useState("");
  const [sentIds, setSentIds] = useState<number[]>([]);

  const { data: searchResults, isFetching } = useSearchUsers(
    { q: search },
    {
      query: { queryKey: ["/api/users/search", search], enabled: search.length > 2 },
      request: { headers: getAuthHeaders() as HeadersInit },
    }
  );

  const sendRequestMutation = useSendFriendRequest({
    request: { headers: getAuthHeaders() as HeadersInit },
    mutation: {
      onSuccess: (_data, variables) => {
        setSentIds((prev) => [...prev, (variables.data as any).receiverId]);
        setSearch("");
        queryClient.invalidateQueries({ queryKey: ["/api/friends/requests"] });
      },
    },
  });

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h2 className="text-xl font-semibold text-white/90 mb-1">Add a Friend</h2>
        <p className="text-sm text-white/40">Search by username to send a friend request.</p>
      </div>

      {/* Search input */}
      <div className="relative group">
        <div className="absolute left-4 top-1/2 -translate-y-1/2 text-white/30 group-focus-within:text-primary/70 transition-colors duration-300 pointer-events-none">
          {isFetching ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Search className="w-4 h-4" />
          )}
        </div>
        {/* Glow border on focus */}
        <div className="absolute -inset-[1px] rounded-2xl bg-gradient-to-r from-primary/20 via-violet-500/20 to-primary/20 blur-sm opacity-0 group-focus-within:opacity-100 transition-opacity duration-300" />
        <input
          autoFocus
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search users..."
          className="relative w-full bg-white/[0.04] border border-white/[0.08] focus:border-primary/30 text-white/90 placeholder:text-white/25 rounded-2xl pl-11 pr-5 py-3.5 focus:outline-none focus:bg-white/[0.06] transition-all duration-300 text-sm font-normal"
        />
        {search.length > 0 && search.length <= 2 && (
          <p className="absolute -bottom-6 left-4 text-[11px] text-white/30 font-normal">
            Type at least 3 characters
          </p>
        )}
      </div>

      {/* Results */}
      <AnimatePresence>
        {search.length > 2 && searchResults && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
            className="space-y-2"
          >
            <div className="flex items-center gap-3 mb-4">
              <span className="section-label">Users Found — {searchResults.length}</span>
              <div className="flex-1 h-px bg-white/[0.05]" />
            </div>

            <div className="space-y-1">
              {searchResults.map((user, i) => {
                const sent = sentIds.includes(user.id);
                return (
                  <motion.div
                    key={user.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.04 }}
                    className="flex items-center justify-between px-4 py-3 rounded-xl border border-white/[0.05] hover:border-primary/20 hover:bg-white/[0.02] transition-all duration-200"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-white/[0.06] border border-white/[0.08] flex items-center justify-center text-white/50 font-semibold text-sm">
                        {user.username[0].toUpperCase()}
                      </div>
                      <span className="font-medium text-white/85 text-[14px]">{user.username}</span>
                    </div>

                    <button
                      onClick={() => sendRequestMutation.mutate({ data: { receiverId: user.id } })}
                      disabled={sendRequestMutation.isPending || sent}
                      className={cn(
                        "h-9 px-4 rounded-xl text-xs font-semibold transition-all duration-200 border flex items-center gap-1.5",
                        sent
                          ? "bg-emerald-500/10 border-emerald-500/15 text-emerald-400/50 cursor-default"
                          : "bg-primary/10 border-primary/20 text-primary hover:bg-primary hover:text-white"
                      )}
                    >
                      {sent ? (
                        <>
                          <Check className="w-3.5 h-3.5" />
                          Request Sent
                        </>
                      ) : (
                        <>
                          <UserPlus className="w-3.5 h-3.5" />
                          Add Friend
                        </>
                      )}
                    </button>
                  </motion.div>
                );
              })}

              {searchResults.length === 0 && (
                <div className="text-center py-16 rounded-2xl border border-dashed border-white/[0.05]">
                  <p className="text-sm text-white/30">No users found for "{search}"</p>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
