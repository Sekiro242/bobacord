import { useState, useEffect, useRef } from "react";
import { Send, PhoneCall } from "lucide-react";
import { format } from "date-fns";
import { useSocket } from "@/hooks/use-socket";
import { useAuth, getAuthHeaders } from "@/hooks/use-auth";
import { useGetDmMessages, useGetGroupMessages, type Message } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { useVoiceSFU } from "@/hooks/use-voice-sfu";
import { InRoomCallUI } from "@/components/ActiveCallOverlay";

interface ChatAreaProps {
  type: "dm" | "group";
  id: number;
  name: string;
  targetUserIds?: number[];
}

export function ChatArea({ type, id, name, targetUserIds = [] }: ChatAreaProps) {
  const { user } = useAuth();
  const { socket } = useSocket();
  const { activeCallRoom, joinCall, inviteToCall } = useVoiceSFU();
  const queryClient = useQueryClient();
  const [newMessage, setNewMessage] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  // Use appropriate query based on type
  const { data: dmMessages, isLoading: loadingDm } = useGetDmMessages(id, {
    query: { enabled: type === "dm", queryKey: [`/api/messages/dm/${id}`] },
    request: { headers: getAuthHeaders() as HeadersInit }
  });

  const { data: groupMessages, isLoading: loadingGroup } = useGetGroupMessages(id, {
    query: { enabled: type === "group", queryKey: [`/api/groups/${id}/messages`] },
    request: { headers: getAuthHeaders() as HeadersInit }
  });

  const messages = type === "dm" ? dmMessages : groupMessages;
  const isLoading = type === "dm" ? loadingDm : loadingGroup;

  const roomId = type === "dm" ? `dm_${Math.min(user?.id || 0, id)}_${Math.max(user?.id || 0, id)}` : `group_${id}`;
  const inThisCall = activeCallRoom === roomId;

  const handleJoinCall = async () => {
    if (targetUserIds.length > 0) {
      inviteToCall(roomId, targetUserIds);
    }
    await joinCall(roomId);
  };

  // Socket setup for receiving messages
  useEffect(() => {
    if (!socket) return;

    const handleNewMessage = (msg: Message) => {
      const queryKey = type === "dm" ? [`/api/messages/dm/${id}`] : [`/api/groups/${id}/messages`];

      // Update cache optimistically
      queryClient.setQueryData<Message[]>(queryKey, (old) => {
        if (!old) return [msg];
        // Prevent duplicates
        if (old.some(m => m.id === msg.id)) return old;
        return [...old, msg];
      });
    };

    const eventName = type === "dm" ? "dm_message" : "group_message";
    socket.on(eventName, handleNewMessage);

    return () => {
      socket.off(eventName, handleNewMessage);
    };
  }, [socket, type, id, queryClient]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !socket || !user) return;

    const content = newMessage.trim();

    if (type === "dm") {
      socket.emit("dm_message", { toUserId: id, content });
    } else {
      socket.emit("group_message", { groupId: id, content });
    }

    setNewMessage("");
  };

  return (
    <div className="flex-1 flex flex-col bg-background h-screen">
      {/* Top Bar */}
      <div className="h-14 shrink-0 border-b border-border flex items-center justify-between px-6 shadow-sm bg-background/95 backdrop-blur-sm z-10">
        <div className="flex items-center gap-3">
          <span className="text-muted-foreground font-bold text-xl">{type === "group" ? "#" : "@"}</span>
          <h2 className="font-bold text-foreground text-lg">{name}</h2>
        </div>
        
        {!inThisCall && (
          <button
            onClick={handleJoinCall}
            disabled={activeCallRoom !== null}
            className="flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 transition-all font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed"
            title={activeCallRoom !== null ? "Already in a call" : "Start voice call"}
          >
            <PhoneCall className="w-4 h-4" />
            Join Voice
          </button>
        )}
      </div>

      {inThisCall && <InRoomCallUI />}

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar" ref={scrollRef}>
        {isLoading ? (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            Loading messages...
          </div>
        ) : messages?.length === 0 ? (
          <div className="flex flex-col h-full items-center justify-center text-muted-foreground space-y-4">
            <div className="w-20 h-20 bg-card rounded-full flex items-center justify-center">
              <span className="text-4xl text-foreground font-bold">{type === "group" ? "#" : "@"}</span>
            </div>
            <h3 className="text-2xl font-bold text-foreground">Welcome to {name}!</h3>
            <p>This is the beginning of your legendary history.</p>
          </div>
        ) : (
          messages?.map((msg, idx) => {
            const isMe = msg.senderId === user?.id;
            const isConsecutive = idx > 0 && messages[idx - 1].senderId === msg.senderId;
            const timeStr = format(new Date(msg.createdAt), 'h:mm a');

            return (
              <div key={msg.id} className={cn(
                "flex gap-4 group hover:bg-card/30 p-1 -mx-4 px-4 rounded-md transition-colors",
                isConsecutive ? "mt-1" : "mt-4",
                isMe && "bg-primary/5 border-l-2 border-primary/20"
              )}>
                {!isConsecutive ? (
                  <div className="relative shrink-0 mt-1">
                    {(msg as any).senderAvatarUrl ? (
                      <img src={(msg as any).senderAvatarUrl} alt={msg.senderUsername} className="w-10 h-10 rounded-full object-cover shadow-sm bg-background border border-border/50" />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold transition-colors">
                        {msg.senderUsername[0].toUpperCase()}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="w-10 shrink-0 text-[10px] text-muted-foreground opacity-0 group-hover:opacity-100 flex items-center justify-center select-none pt-1">
                    {timeStr}
                  </div>
                )}
                <div className="flex flex-col min-w-0 flex-1">
                  {!isConsecutive && (
                    <div className="flex items-baseline gap-2 mb-1">
                      <span className={cn(
                        "font-medium hover:underline cursor-pointer",
                        isMe ? "text-primary" : "text-foreground"
                      )}>
                        {msg.senderUsername}
                        {isMe && <span className="ml-2 text-[10px] bg-primary/20 text-primary px-1.5 py-0.5 rounded font-bold uppercase tracking-wider">You</span>}
                      </span>
                      <span className="text-xs text-muted-foreground select-none">{format(new Date(msg.createdAt), 'MM/dd/yyyy h:mm a')}</span>
                    </div>
                  )}
                  <p className="text-foreground/90 leading-relaxed whitespace-pre-wrap break-words">{msg.content}</p>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Input Area */}
      <div className="p-4 bg-background">
        <form
          onSubmit={handleSendMessage}
          className="bg-card rounded-xl px-4 py-3 flex items-center gap-3 border border-border/50 focus-within:border-primary/50 focus-within:ring-1 focus-within:ring-primary/50 transition-all shadow-inner"
        >
          <input
            autoFocus
            type="text"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder={`Message ${type === "group" ? "#" : "@"}${name}`}
            className="flex-1 bg-transparent border-none focus:outline-none text-foreground placeholder:text-muted-foreground"
          />
          <button
            type="submit"
            disabled={!newMessage.trim()}
            className="p-2 rounded-full text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors disabled:opacity-50 disabled:hover:bg-transparent disabled:hover:text-muted-foreground"
          >
            <Send className="w-5 h-5" />
          </button>
        </form>
      </div>
    </div>
  );
}
