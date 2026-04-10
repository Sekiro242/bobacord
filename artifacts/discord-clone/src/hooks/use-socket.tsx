import { useEffect, useState, createContext, useContext } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuth } from './use-auth';
import { useQueryClient } from '@tanstack/react-query';

interface SocketContextValue {
  socket: Socket | null;
  isConnected: boolean;
}

const SocketContext = createContext<SocketContextValue>({ socket: null, isConnected: false });

export function useSocket() {
  return useContext(SocketContext);
}

export function SocketProvider({ children }: { children: React.ReactNode }) {
  const { token, isAuthenticated } = useAuth();
  const [socket, setSocket] = useState<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  const queryClient = useQueryClient();

  useEffect(() => {
    if (!isAuthenticated || !token) {
      if (socket) {
        console.log('[Socket] Disconnecting – user logged out');
        socket.disconnect();
        setSocket(null);
        setIsConnected(false);
      }
      return;
    }

    console.log('[Socket] Connecting to server...');
    const newSocket = io({
      auth: { token },
      // Allow polling fallback so it works behind all proxies
      transports: ['polling', 'websocket'],
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
    });

    newSocket.on('connect', () => {
      console.log('[Socket] Connected! Socket ID:', newSocket.id);
      setIsConnected(true);
    });

    newSocket.on('disconnect', (reason) => {
      console.warn('[Socket] Disconnected:', reason);
      setIsConnected(false);
    });

    newSocket.on('connect_error', (err) => {
      console.error('[Socket] Connection error:', err.message);
    });

    // ─── GLOBAL REAL-TIME LISTENERS ──────────────────────────────────────────
    // Invalidate queries to refresh data in the background (no manual refresh needed)

    newSocket.on('group_created', () => {
      console.log('[Socket] Group created - refreshing list');
      queryClient.invalidateQueries({ queryKey: ["/api/groups"] });
    });

    newSocket.on('friend_request_received', () => {
      console.log('[Socket] Friend request received - refreshing');
      queryClient.invalidateQueries({ queryKey: ["/api/friends/requests"] });
    });

    newSocket.on('friend_request_accepted', () => {
      console.log('[Socket] Friend request accepted - refreshing');
      queryClient.invalidateQueries({ queryKey: ["/api/friends"] });
      queryClient.invalidateQueries({ queryKey: ["/api/friends/requests"] });
    });

    newSocket.on('dm_message', () => {
      // Invalidate friends to update unread counts and sorting in sidebar
      queryClient.invalidateQueries({ queryKey: ["/api/friends"] });
    });

    newSocket.on('group_message', () => {
      // Invalidate groups to update unread counts in sidebar
      queryClient.invalidateQueries({ queryKey: ["/api/groups"] });
    });

    setSocket(newSocket);

    return () => {
      console.log('[Socket] Cleaning up socket connection');
      newSocket.off('group_created');
      newSocket.off('friend_request_received');
      newSocket.off('friend_request_accepted');
      newSocket.off('dm_message');
      newSocket.off('group_message');
      newSocket.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, isAuthenticated, queryClient]);

  return (
    <SocketContext.Provider value={{ socket, isConnected }}>
      {children}
    </SocketContext.Provider>
  );
}
