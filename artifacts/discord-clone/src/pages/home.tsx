import { useEffect } from "react";
import { useRoute, useLocation } from "wouter";
import { Sidebar } from "@/components/layout/Sidebar";
import { ChatArea } from "@/components/chat/ChatArea";
import FriendsPage from "./friends";
import { useAuth, getAuthHeaders } from "@/hooks/use-auth";
import { useGetFriends, useGetGroups } from "@workspace/api-client-react";

export default function Home() {
  const { isAuthenticated, isLoading, user } = useAuth();
  const [, setLocation] = useLocation();

  const [matchDm, paramsDm] = useRoute("/dm/:id");
  const [matchGroup, paramsGroup] = useRoute("/group/:id");

  const { data: friends } = useGetFriends({ query: { queryKey: ["/api/friends"], enabled: isAuthenticated }, request: { headers: getAuthHeaders() as HeadersInit } });
  const { data: groups } = useGetGroups({ query: { queryKey: ["/api/groups"], enabled: isAuthenticated }, request: { headers: getAuthHeaders() as HeadersInit } });

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      setLocation("/login");
    }
  }, [isAuthenticated, isLoading, setLocation]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#020203] flex items-center justify-center relative overflow-hidden">
        {/* Prism background glow */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-primary/10 rounded-full blur-[120px] opacity-40 animate-pulse"></div>
        
        <div className="flex flex-col items-center gap-8 relative z-10 animate-boba-float">
          <div className="relative">
            <div className="w-20 h-20 rounded-full bg-gradient-to-tr from-[#9167e4] to-[#f472b6] flex items-center justify-center border border-white/20 shadow-[0_0_50px_rgba(145,103,228,0.4)] overflow-hidden p-1">
               <img src="/logo.png" alt="Bobacord" className="w-full h-full object-cover rounded-full" />
            </div>
          </div>
          <div className="flex flex-col items-center gap-2">
            <h2 className="text-2xl font-black tracking-tighter text-white">Bobacord</h2>
            <div className="flex gap-1">
              {[0, 1, 2].map(i => (
                <div key={i} className="w-1 h-1 rounded-full bg-primary/40 animate-pulse" style={{ animationDelay: `${i * 0.2}s` }} />
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) return null;

  let content;
  if (matchDm && paramsDm) {
    const friendId = parseInt(paramsDm.id);
    const friend = friends?.find(f => f.id === friendId);
    content = (
      <ChatArea
        type="dm"
        id={friendId}
        name={friend?.username || "Loading..."}
        targetUserIds={[friendId]}
      />
    );
  } else if (matchGroup && paramsGroup) {
    const groupId = parseInt(paramsGroup.id);
    const group = groups?.find(g => g.id === groupId);
    const members: { id: number }[] = (group as any)?.members ?? [];
    const otherMemberIds = members.filter(m => m.id !== user?.id).map(m => m.id);
    content = (
      <ChatArea
        type="group"
        id={groupId}
        name={group?.name || "Loading..."}
        targetUserIds={otherMemberIds}
      />
    );
  } else {
    content = <FriendsPage />;
  }

  return (
    <div className="flex h-screen w-full overflow-hidden bg-[#020203] text-foreground selection:bg-primary/30 outline-none">
      <Sidebar />
      <div className="flex-1 relative overflow-hidden z-0 flex flex-col bg-[#040406]">
        {content}
      </div>
    </div>
  );
}
