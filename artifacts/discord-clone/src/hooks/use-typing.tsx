import { useEffect, useState, createContext, useContext, useCallback } from 'react';
import { useSocket } from './use-socket';

type TypingRoomId = string; // e.g., "dm_2" or "group_5"
type UserTypingState = Record<number, { username: string; timestamp: number }>;
type TypingState = Record<TypingRoomId, UserTypingState>;

interface TypingContextValue {
  typingState: TypingState;
  getTypingUsers: (type: "dm" | "group", id: number) => string[];
}

const TypingContext = createContext<TypingContextValue>({
  typingState: {},
  getTypingUsers: () => [],
});

export function useTyping() {
  return useContext(TypingContext);
}

export function TypingProvider({ children }: { children: React.ReactNode }) {
  const { socket } = useSocket();
  const [typingState, setTypingState] = useState<TypingState>({});

  useEffect(() => {
    if (!socket) return;

    const handleTypingUpdate = (data: { type: "dm" | "group"; id: number; userId: number; username: string; isTyping: boolean }) => {
      const roomKey = `${data.type}_${data.id}`;
      
      setTypingState(prev => {
        const roomState = { ...(prev[roomKey] || {}) };
        
        if (data.isTyping) {
          roomState[data.userId] = { username: data.username, timestamp: Date.now() };
        } else {
          delete roomState[data.userId];
        }
        
        return {
          ...prev,
          [roomKey]: roomState
        };
      });
    };

    socket.on("typing_update", handleTypingUpdate);
    
    // Cleanup stale typing status periodically
    const intervalId = setInterval(() => {
      const now = Date.now();
      let changed = false;
      
      setTypingState(prev => {
        const next = { ...prev };
        for (const roomKey in next) {
          const roomState = { ...next[roomKey] };
          let roomChanged = false;
          
          for (const userIdStr in roomState) {
            const userId = parseInt(userIdStr);
            if (now - roomState[userId].timestamp > 10000) { // 10 seconds timeout
              delete roomState[userId];
              roomChanged = true;
              changed = true;
            }
          }
          if (roomChanged) {
            next[roomKey] = roomState;
          }
        }
        return changed ? next : prev;
      });
    }, 3000);

    return () => {
      socket.off("typing_update", handleTypingUpdate);
      clearInterval(intervalId);
    };
  }, [socket]);

  const getTypingUsers = useCallback((type: "dm" | "group", id: number) => {
    const roomKey = `${type}_${id}`;
    const roomState = typingState[roomKey];
    if (!roomState) return [];
    
    return Object.values(roomState).map(u => u.username);
  }, [typingState]);

  return (
    <TypingContext.Provider value={{ typingState, getTypingUsers }}>
      {children}
    </TypingContext.Provider>
  );
}
