import { useState, useEffect, useRef, useCallback } from "react";
import { Send, Phone, Volume2, VolumeX } from "lucide-react";
import { format, isToday, isYesterday } from "date-fns";
import { useSocket } from "@/hooks/use-socket";
import { useAuth, getAuthHeaders } from "@/hooks/use-auth";
import { useGetDmMessages, useGetGroupMessages, type Message } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { useVoiceSFU } from "@/hooks/use-voice-sfu";
import { InRoomCallUI } from "@/components/ActiveCallOverlay";
import { useUnread } from "@/hooks/use-unread";
import { useNotifications } from "@/hooks/use-notifications";
import { motion, AnimatePresence } from "framer-motion";

interface ChatAreaProps {
  type: "dm" | "group";
  id: number;
  name: string;
  targetUserIds?: number[];
}

/** Format timestamp Discord-style: "Today at 2:32 PM" / "Yesterday at 9:15 AM" / "04/07/2026" */
function formatMessageTime(dateStr: string): string {
  const date = new Date(dateStr);
  if (isToday(date)) return `Today at ${format(date, "h:mm a")}`;
  if (isYesterday(date)) return `Yesterday at ${format(date, "h:mm a")}`;
  return format(date, "MM/dd/yyyy");
}

/** Short time for consecutive message hover */
function formatShortTime(dateStr: string): string {
  return format(new Date(dateStr), "h:mm a");
}

/** Group consecutive messages from the same sender (within 7 minutes) */
function isConsecutiveMessage(prev: Message, curr: Message): boolean {
  if (prev.senderId !== curr.senderId) return false;
  const diff = new Date(curr.createdAt).getTime() - new Date(prev.createdAt).getTime();
  return diff < 7 * 60 * 1000; // 7 minutes
}

export function ChatArea({ type, id, name, targetUserIds = [] }: ChatAreaProps) {
  const { user } = useAuth();
  const { socket } = useSocket();
  const { activeCallRoom, joinCall, inviteToCall } = useVoiceSFU();
  const { markAsRead } = useUnread();
  const { playAlertSound, setSoundEnabled, isSoundEnabled } = useNotifications();
  const queryClient = useQueryClient();
  const [newMessage, setNewMessage] = useState("");
  const [soundOn, setSoundOn] = useState(isSoundEnabled());
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Mark as read on entry and when ID changes
  useEffect(() => {
    markAsRead(type, id);
  }, [type, id, markAsRead]);

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

  const roomId = type === "dm"
    ? `dm_${Math.min(user?.id || 0, id)}_${Math.max(user?.id || 0, id)}`
    : `group_${id}`;
  const inThisCall = activeCallRoom === roomId;

  const handleJoinCall = async () => {
    playAlertSound(); // Audible feedback when starting a call
    if (targetUserIds.length > 0) {
      inviteToCall(roomId, targetUserIds);
    }
    await joinCall(roomId);
  };

  const handleToggleSound = () => {
    const next = !soundOn;
    setSoundOn(next);
    setSoundEnabled(next);
  };

  // Socket setup for receiving messages
  useEffect(() => {
    if (!socket) return;

    const handleNewMessage = (msg: Message) => {
      const queryKey = type === "dm"
        ? [`/api/messages/dm/${id}`]
        : [`/api/groups/${id}/messages`];

      queryClient.setQueryData<Message[]>(queryKey, (old) => {
        if (!old) return [msg];
        if (old.some(m => m.id === msg.id)) return old;
        return [...old, msg];
      });

      if (document.visibilityState === "visible") {
        markAsRead(type, id);
      }
    };

    const eventName = type === "dm" ? "dm_message" : "group_message";
    socket.on(eventName, handleNewMessage);

    return () => {
      socket.off(eventName, handleNewMessage);
    };
  }, [socket, type, id, queryClient]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
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

  // Allow Shift+Enter for newlines, Enter to send
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (newMessage.trim()) {
        handleSendMessage(e as any);
      }
    }
  };

  return (
    <div className="flex-1 flex flex-col bg-[#040406] h-screen overflow-hidden relative">
      {/* Background ambient glow */}
      <div className="absolute inset-0 pointer-events-none opacity-15 overflow-hidden">
        <div className="absolute top-[-10%] right-[-10%] w-[50%] h-[50%] bg-primary/20 blur-[120px] rounded-full" />
        <div className="absolute bottom-[-10%] left-[-10%] w-[40%] h-[40%] bg-violet-600/10 blur-[120px] rounded-full" />
      </div>

      {/* ── Top Bar ── */}
      <div className="h-14 shrink-0 border-b border-white/[0.04] flex items-center justify-between px-6 relative z-20 bg-black/30 backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <div className={cn(
            "w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm border",
            type === "dm"
              ? "bg-primary/15 text-primary border-primary/20"
              : "bg-violet-500/10 text-violet-400 border-violet-500/20"
          )}>
            {type === "dm" ? "@" : "#"}
          </div>
          <div className="flex flex-col">
            <h2 className="font-semibold text-white/90 text-[15px] leading-tight">{name}</h2>
            <div className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.5)]" />
              <span className="text-[10px] font-medium text-white/40 leading-tight">Online</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {/* Sound mute toggle */}
          <button
            onClick={handleToggleSound}
            title={soundOn ? "Mute notifications" : "Unmute notifications"}
            className="p-2 rounded-lg text-white/30 hover:text-white/70 hover:bg-white/[0.05] transition-all"
          >
            {soundOn
              ? <Volume2 className="w-4 h-4" />
              : <VolumeX className="w-4 h-4 text-destructive/60" />
            }
          </button>

          {!inThisCall && (
            <button
              onClick={handleJoinCall}
              disabled={activeCallRoom !== null}
              title="Start voice call"
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-white/[0.04] text-white/45 hover:text-white hover:bg-white/[0.08] border border-white/[0.06] transition-all duration-200 font-medium text-xs disabled:opacity-30"
            >
              <Phone className="w-3.5 h-3.5" />
              <span>Start Call</span>
            </button>
          )}
        </div>
      </div>

      {inThisCall && <InRoomCallUI />}

      {/* ── Messages Area ── */}
      <div
        className="flex-1 overflow-y-auto px-6 py-6 space-y-0.5 relative z-10"
        ref={scrollRef}
      >
        {isLoading ? (
          <div className="flex h-full items-center justify-center">
            <div className="flex flex-col items-center gap-3">
              <div className="flex gap-1">
                {[0, 1, 2].map(i => (
                  <div
                    key={i}
                    className="w-1.5 h-1.5 rounded-full bg-primary/40 animate-bounce"
                    style={{ animationDelay: `${i * 0.15}s` }}
                  />
                ))}
              </div>
              <span className="text-white/30 text-xs font-medium">Loading messages…</span>
            </div>
          </div>
        ) : messages?.length === 0 ? (
          <div className="flex flex-col h-[65vh] items-center justify-center text-center space-y-6 animate-fade-up">
            <div className="relative">
              <div className="w-20 h-20 rounded-full bg-gradient-to-tr from-primary/20 to-violet-500/20 flex items-center justify-center border border-white/[0.07]">
                <span className="text-3xl font-bold text-white/50">{type === "group" ? "#" : "@"}</span>
              </div>
              <div className="absolute -inset-4 bg-primary/5 blur-2xl rounded-full -z-10 animate-pulse" />
            </div>
            <div className="space-y-1.5">
              <h3 className="text-xl font-semibold text-white/80 tracking-tight">
                Start a conversation with {name}
              </h3>
              <p className="text-sm text-white/35 font-normal">Be the first to say hello! 👋</p>
            </div>
          </div>
        ) : (
          <>
            {messages?.map((msg, idx) => {
              const isMe = msg.senderId === user?.id;
              const prevMsg = idx > 0 ? messages[idx - 1] : null;
              const isContinuation = prevMsg ? isConsecutiveMessage(prevMsg, msg) : false;

              // Show a date separator when the day changes
              const showDateSep = !prevMsg ||
                new Date(msg.createdAt).toDateString() !== new Date(prevMsg.createdAt).toDateString();

              return (
                <div key={msg.id}>
                  {/* ── Date separator ── */}
                  {showDateSep && (
                    <div className="flex items-center gap-3 my-4">
                      <div className="flex-1 h-px bg-white/[0.05]" />
                      <span className="text-[11px] font-medium text-white/30 px-2">
                        {isToday(new Date(msg.createdAt))
                          ? "Today"
                          : isYesterday(new Date(msg.createdAt))
                          ? "Yesterday"
                          : format(new Date(msg.createdAt), "MMMM d, yyyy")}
                      </span>
                      <div className="flex-1 h-px bg-white/[0.05]" />
                    </div>
                  )}

                  {/* ── Message bubble ── */}
                  <motion.div
                    initial={isContinuation ? false : { opacity: 0, x: -6 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.18 }}
                    className={cn(
                      "flex gap-3 group px-3 py-0.5 -mx-3 rounded-lg transition-colors duration-150 hover:bg-white/[0.02]",
                      !isContinuation && "mt-4"
                    )}
                  >
                    {/* Avatar column */}
                    {!isContinuation ? (
                      <div className="relative shrink-0 mt-0.5">
                        {(msg as any).senderAvatarUrl ? (
                          <img
                            src={(msg as any).senderAvatarUrl}
                            alt={msg.senderUsername}
                            className="w-9 h-9 rounded-full object-cover border border-white/[0.08]"
                          />
                        ) : (
                          <div className="w-9 h-9 rounded-full bg-white/[0.06] flex items-center justify-center text-white/35 font-semibold text-sm border border-white/[0.08]">
                            {msg.senderUsername[0].toUpperCase()}
                          </div>
                        )}
                      </div>
                    ) : (
                      /* Timestamp hint on hover for continuation messages */
                      <div className="w-9 shrink-0 flex items-end justify-center pb-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <span className="text-[9px] text-white/25 font-medium leading-none">
                          {formatShortTime(msg.createdAt)}
                        </span>
                      </div>
                    )}

                    {/* Content column */}
                    <div className="flex flex-col min-w-0 flex-1">
                      {/* Header: username + timestamp */}
                      {!isContinuation && (
                        <div className="flex items-baseline gap-2 mb-0.5">
                          <span className={cn(
                            "font-semibold text-[13px] leading-tight hover:underline cursor-pointer",
                            isMe ? "text-primary" : "text-white/85"
                          )}>
                            {msg.senderUsername}
                          </span>
                          {/* Discord-style timestamp: "Today at 2:32 PM" */}
                          <span className="text-[10px] font-normal text-white/30">
                            {formatMessageTime(msg.createdAt)}
                          </span>
                        </div>
                      )}
                      {/* Message text */}
                      <p className={cn(
                        "text-[14px] leading-relaxed whitespace-pre-wrap break-words font-normal",
                        isMe ? "text-white/95" : "text-white/80"
                      )}>
                        {msg.content}
                      </p>
                    </div>
                  </motion.div>
                </div>
              );
            })}
            {/* Invisible anchor for auto-scroll */}
            <div ref={bottomRef} />
          </>
        )}
      </div>

      {/* ── Input Area ── */}
      <div className="px-6 pb-5 pt-3 relative z-20">
        <div className="relative group">
          {/* Focus glow ring */}
          <div className="absolute -inset-[1px] bg-gradient-to-r from-primary/25 via-violet-500/25 to-primary/25 rounded-2xl blur-sm opacity-0 group-focus-within:opacity-100 transition-opacity duration-400" />

          <form
            onSubmit={handleSendMessage}
            className="relative bg-white/[0.04] border border-white/[0.08] rounded-2xl px-4 py-3 flex items-center gap-3 backdrop-blur-xl group-focus-within:bg-black/35 group-focus-within:border-white/[0.12] transition-all duration-300"
          >
            <input
              autoFocus
              type="text"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={`Message ${name}…`}
              className="flex-1 bg-transparent border-none focus:outline-none text-white placeholder:text-white/25 text-sm font-normal"
            />
            <button
              type="submit"
              disabled={!newMessage.trim()}
              title="Send message"
              className="w-7 h-7 rounded-full bg-white/[0.06] text-white/35 hover:text-white hover:bg-primary transition-all duration-200 disabled:opacity-30 flex items-center justify-center shrink-0"
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
