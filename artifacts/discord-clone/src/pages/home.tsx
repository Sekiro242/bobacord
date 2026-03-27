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

  const { data: friends } = useGetFriends({ request: { headers: getAuthHeaders() }, query: { enabled: isAuthenticated } });
  const { data: groups } = useGetGroups({ request: { headers: getAuthHeaders() }, query: { enabled: isAuthenticated } });

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      setLocation("/login");
    }
  }, [isAuthenticated, isLoading, setLocation]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-pulse flex flex-col items-center gap-4">
          <div className="w-16 h-16 bg-primary/20 rounded-full flex items-center justify-center">
            <div className="w-8 h-8 bg-primary rounded-full animate-bounce"></div>
          </div>
          <p className="text-muted-foreground font-medium">Connecting...</p>
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
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar />
      {content}
    </div>
  );
}
