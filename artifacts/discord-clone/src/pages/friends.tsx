import { useState } from "react";
import { Users, UserPlus, Check, X, Search } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetFriends,
  useGetFriendRequests,
  useSearchUsers,
  useSendFriendRequest,
  useAcceptFriendRequest,
  type User
} from "@workspace/api-client-react";
import { getAuthHeaders } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import { Link } from "wouter";

import { useSocket } from "@/hooks/use-socket";
import { useEffect } from "react";

type Tab = "online" | "all" | "pending" | "add";

export default function FriendsPage() {
  const [activeTab, setActiveTab] = useState<Tab>("all");
  const queryClient = useQueryClient();
  const { socket } = useSocket();

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
    socket.on("friend_request_accepted", onFriendAccept);

    return () => {
      socket.off("friend_request_received", onFriendRequest);
      socket.off("friend_request_accepted", onFriendAccept);
    };
  }, [socket, queryClient]);

  const { data: friends } = useGetFriends({ request: { headers: getAuthHeaders() } });
  const { data: requests } = useGetFriendRequests({ request: { headers: getAuthHeaders() } });

  const acceptMutation = useAcceptFriendRequest({
    request: { headers: getAuthHeaders() },
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/friends/requests"] });
        queryClient.invalidateQueries({ queryKey: ["/api/friends"] });
      }
    }
  });

  return (
    <div className="flex-1 flex flex-col bg-background h-screen">
      {/* Top Bar */}
      <div className="h-14 border-b border-border flex items-center px-6 gap-6 shadow-sm bg-background/95 backdrop-blur-sm z-10 shrink-0">
        <div className="flex items-center gap-2 font-bold text-foreground">
          <Users className="w-5 h-5 text-muted-foreground" />
          Friends
        </div>
        <div className="w-px h-6 bg-border mx-2"></div>
        <div className="flex items-center gap-4">
          <button
            onClick={() => setActiveTab("all")}
            className={cn("px-2 py-1 rounded-md transition-colors font-medium text-sm", activeTab === "all" ? "bg-card text-foreground" : "text-muted-foreground hover:bg-card/50 hover:text-foreground")}
          >
            All
          </button>
          <button
            onClick={() => setActiveTab("pending")}
            className={cn("px-2 py-1 rounded-md transition-colors font-medium text-sm flex items-center gap-1.5", activeTab === "pending" ? "bg-card text-foreground" : "text-muted-foreground hover:bg-card/50 hover:text-foreground")}
          >
            Pending
            {requests && requests.length > 0 && (
              <span className="bg-destructive text-destructive-foreground text-[10px] px-1.5 py-0.5 rounded-full min-w-4 text-center">
                {requests.length}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab("add")}
            className={cn("px-3 py-1 rounded-md transition-colors font-medium text-sm bg-emerald-600 text-white hover:bg-emerald-700")}
          >
            Add Friend
          </button>
        </div>
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
        {activeTab === "all" && (
          <div className="max-w-3xl mx-auto">
            <h3 className="uppercase text-xs font-bold text-muted-foreground mb-4 border-b border-border pb-2">
              All Friends — {friends?.length || 0}
            </h3>
            <div className="space-y-2">
              {friends?.map(friend => (
                <div key={friend.id} className="flex items-center justify-between p-3 hover:bg-card rounded-xl transition-all border border-transparent hover:border-border group">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold text-lg relative">
                      {friend.username[0].toUpperCase()}
                      <div className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-500 border-[3px] border-background rounded-full"></div>
                    </div>
                    <div>
                      <div className="font-bold text-foreground text-base">{friend.username}</div>
                      <div className="text-xs text-muted-foreground">Online</div>
                    </div>
                  </div>
                  <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Link
                      href={`/dm/${friend.id}`}
                      className="w-10 h-10 rounded-full bg-background flex items-center justify-center text-muted-foreground hover:text-foreground shadow-sm border border-border"
                      title="Message"
                    >
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
                    </Link>
                  </div>
                </div>
              ))}
              {friends?.length === 0 && (
                <div className="text-center py-12 text-muted-foreground flex flex-col items-center">
                  <div className="w-48 h-48 bg-card/50 rounded-full flex items-center justify-center mb-6">
                    <Users className="w-20 h-20 opacity-20" />
                  </div>
                  <p>Wumpus is waiting on friends. You don't have to though!</p>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === "pending" && (
          <div className="max-w-3xl mx-auto">
            <h3 className="uppercase text-xs font-bold text-muted-foreground mb-4 border-b border-border pb-2">
              Pending Requests — {requests?.length || 0}
            </h3>
            <div className="space-y-2">
              {requests?.map(req => (
                <div key={req.id} className="flex items-center justify-between p-3 hover:bg-card rounded-xl transition-all border border-transparent hover:border-border group">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold text-lg">
                      {req.sender?.username?.[0].toUpperCase() || '?'}
                    </div>
                    <div>
                      <div className="font-bold text-foreground text-base">{req.sender?.username}</div>
                      <div className="text-xs text-muted-foreground">Incoming Friend Request</div>
                    </div>
                  </div>
                  <h2 className="text-xl font-bold bg-gradient-to-r from-emerald-400 to-cyan-400 bg-clip-text text-transparent">
                    Bobacord
                  </h2>
                  <div className="flex gap-2">
                    <button
                      onClick={() => acceptMutation.mutate({ data: { requestId: req.id } })}
                      disabled={acceptMutation.isPending}
                      className="w-10 h-10 rounded-full bg-background flex items-center justify-center text-emerald-500 hover:bg-emerald-500/10 shadow-sm border border-border transition-colors disabled:opacity-50"
                      title="Accept"
                    >
                      <Check className="w-5 h-5" />
                    </button>
                    <button
                      className="w-10 h-10 rounded-full bg-background flex items-center justify-center text-destructive hover:bg-destructive/10 shadow-sm border border-border transition-colors"
                      title="Ignore"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              ))}
              {requests?.length === 0 && (
                <div className="text-center py-12 text-muted-foreground flex flex-col items-center">
                  <div className="w-48 h-48 bg-card/50 rounded-full flex items-center justify-center mb-6">
                    <UserPlus className="w-20 h-20 opacity-20" />
                  </div>
                  <p>There are no pending friend requests. Here's a Wumpus for now.</p>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === "add" && <AddFriendTab />}
      </div>
    </div>
  );
}

function AddFriendTab() {
  const [search, setSearch] = useState("");
  const queryClient = useQueryClient();

  const { data: searchResults, isFetching } = useSearchUsers(
    { q: search },
    {
      query: { enabled: search.length > 2 },
      request: { headers: getAuthHeaders() }
    }
  );

  const sendRequestMutation = useSendFriendRequest({
    request: { headers: getAuthHeaders() },
    mutation: {
      onSuccess: () => {
        // Just show success somehow, real app would show a toast
        alert("Friend request sent!");
        setSearch("");
      }
    }
  });

  return (
    <div className="max-w-3xl mx-auto pt-6">
      <div className="mb-6">
        <h2 className="text-foreground font-bold text-lg mb-2">ADD FRIEND</h2>
        <p className="text-muted-foreground text-sm">You can add friends with their Discord Clone usernames.</p>
      </div>

      <div className="relative mb-8">
        <input
          autoFocus
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="You can add friends with their usernames."
          className="w-full bg-input text-foreground border border-border focus:border-primary focus:ring-1 focus:ring-primary rounded-xl px-4 py-4 pr-32 transition-all shadow-inner"
        />
        <button
          disabled={search.length < 3 || isFetching}
          className="absolute right-2 top-2 bottom-2 bg-primary text-white font-medium px-4 rounded-lg hover:bg-primary/90 transition-all disabled:opacity-50 disabled:hover:bg-primary"
        >
          {isFetching ? "Searching..." : "Search"}
        </button>
      </div>

      {search.length > 2 && searchResults && (
        <div>
          <h3 className="uppercase text-xs font-bold text-muted-foreground mb-4 border-b border-border pb-2">
            Search Results
          </h3>
          <div className="space-y-2">
            {searchResults.map(user => (
              <div key={user.id} className="flex items-center justify-between p-3 bg-card rounded-xl border border-border">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold">
                    {user.username[0].toUpperCase()}
                  </div>
                  <div className="font-bold text-foreground text-base">{user.username}</div>
                </div>
                <button
                  onClick={() => sendRequestMutation.mutate({ data: { receiverId: user.id } })}
                  disabled={sendRequestMutation.isPending}
                  className="bg-primary/10 text-primary hover:bg-primary hover:text-white px-4 py-2 rounded-md font-medium text-sm transition-all"
                >
                  Send Request
                </button>
              </div>
            ))}
            {searchResults.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                Hm, didn't work. Double check that the username is correct.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
