import { useState, useEffect, useCallback, createContext, useContext, useRef } from "react";
import { useSocket } from "./use-socket";
import { useNotifications } from "./use-notifications";
import { useLocation } from "wouter";

interface UnreadCounts {
  dm: Record<number, number>;
  group: Record<number, number>;
}

interface UnreadContextValue {
  unreadCounts: UnreadCounts;
  setInitialCounts: (counts: UnreadCounts) => void;
  markAsRead: (type: "dm" | "group", id: number) => void;
}

const UnreadContext = createContext<UnreadContextValue>({
  unreadCounts: { dm: {}, group: {} },
  setInitialCounts: () => {},
  markAsRead: () => {},
});

export function useUnread() {
  return useContext(UnreadContext);
}

export function UnreadProvider({ children }: { children: React.ReactNode }) {
  const { socket } = useSocket();
  const { sendNotification, playNotificationSound } = useNotifications();
  const [location] = useLocation();
  const [unreadCounts, setUnreadCounts] = useState<UnreadCounts>({ dm: {}, group: {} });

  // Track total unread for browser tab title badge
  const totalUnread = Object.values(unreadCounts.dm).reduce((s, n) => s + n, 0) +
    Object.values(unreadCounts.group).reduce((s, n) => s + n, 0);

  // Update document title with unread badge
  useEffect(() => {
    if (totalUnread > 0) {
      document.title = `(${totalUnread > 99 ? "99+" : totalUnread}) BobaCord`;
    } else {
      document.title = "BobaCord";
    }
  }, [totalUnread]);

  const setInitialCounts = useCallback((counts: UnreadCounts) => {
    setUnreadCounts(counts);
  }, []);

  const markAsRead = useCallback((type: "dm" | "group", id: number) => {
    if (!socket) return;
    socket.emit("message_read", { type, id });
    setUnreadCounts(prev => ({
      ...prev,
      [type]: { ...prev[type], [id]: 0 }
    }));
  }, [socket]);

  useEffect(() => {
    if (!socket) return;

    const handleUnreadUpdate = (data: { type: "dm" | "group"; id: number; title?: string; body?: string }) => {
      const { type, id, title, body } = data;

      // Don't count if we're currently viewing this chat
      const currentDmMatch = location.match(/^\/dm\/(\d+)$/);
      const currentGroupMatch = location.match(/^\/group\/(\d+)$/);

      const isViewingChat =
        (type === "dm" && currentDmMatch && parseInt(currentDmMatch[1]) === id) ||
        (type === "group" && currentGroupMatch && parseInt(currentGroupMatch[1]) === id);

      if (isViewingChat && document.visibilityState === "visible") {
        socket.emit("message_read", { type, id });
        return;
      }

      // Increment unread counter
      setUnreadCounts(prev => ({
        ...prev,
        [type]: { ...prev[type], [id]: (prev[type][id] || 0) + 1 }
      }));

      // Play notification sound (works even when tab is visible — in-app alert)
      playNotificationSound();

      // Desktop notification (only when tab is hidden)
      if (title && body) {
        sendNotification(title, { body });
      }
    };

    socket.on("unread_update", handleUnreadUpdate);
    return () => {
      socket.off("unread_update", handleUnreadUpdate);
    };
  }, [socket, location, sendNotification, playNotificationSound]);

  return (
    <UnreadContext.Provider value={{ unreadCounts, setInitialCounts, markAsRead }}>
      {children}
    </UnreadContext.Provider>
  );
}
