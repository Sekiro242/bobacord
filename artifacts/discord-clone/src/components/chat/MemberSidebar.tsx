import { useAuth, getAuthHeaders } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react"; // I'll check if this is available
import { cn } from "@/lib/utils";
import { ProfilePopup } from "./ProfilePopup";
import { useState } from "react";
import { useSettings } from "@/hooks/use-settings";

interface GroupMember {
  id: number;
  username: string;
  avatarUrl: string | null;
}

interface GroupDetails {
  id: number;
  name: string;
  members: GroupMember[];
}

interface MemberSidebarProps {
  groupId: number;
}

export function MemberSidebar({ groupId }: MemberSidebarProps) {
  const { user } = useAuth();
  const [selectedProfileId, setSelectedProfileId] = useState<number | null>(null);
  const { openSettings } = useSettings();

  const { data: group, isLoading } = useQuery<GroupDetails>({
    queryKey: [`/api/groups/${groupId}`],
    queryFn: async () => {
      const res = await fetch(`/api/groups/${groupId}`, {
        headers: getAuthHeaders() as any,
      });
      if (!res.ok) throw new Error("Failed to fetch group details");
      return res.json();
    },
    enabled: !!groupId,
  });

  if (isLoading) {
    return (
      <div className="w-60 shrink-0 bg-[#040406]/50 border-l border-white/[0.04] p-6 flex flex-col gap-4">
        <div className="h-4 w-24 bg-white/[0.05] rounded animate-pulse" />
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-white/[0.05] animate-pulse" />
            <div className="h-4 flex-1 bg-white/[0.05] rounded animate-pulse" />
          </div>
        ))}
      </div>
    );
  }

  const members = group?.members || [];

  return (
    <div className="w-60 shrink-0 bg-[#040406]/50 border-l border-white/[0.04] p-4 flex flex-col relative z-20">
      <h3 className="text-[11px] font-bold text-white/30 uppercase tracking-wider mb-4 px-2">
        Members — {members.length}
      </h3>

      <div className="flex flex-col gap-1 overflow-y-auto">
        {members.map((member) => (
          <button
            key={member.id}
            onClick={() => setSelectedProfileId(member.id)}
            className="flex items-center gap-3 px-2 py-1.5 rounded-lg hover:bg-white/[0.04] transition-all group text-left"
          >
            <div className="relative shrink-0">
              {member.avatarUrl ? (
                <img
                  src={member.avatarUrl}
                  alt={member.username}
                  className="w-8 h-8 rounded-full object-cover border border-white/[0.08]"
                />
              ) : (
                <div className="w-8 h-8 rounded-full bg-white/[0.06] flex items-center justify-center text-white/35 font-semibold text-xs border border-white/[0.08]">
                  {member.username[0].toUpperCase()}
                </div>
              )}
              {/* Online indicator (mocked for now as we don't have real-time presence yet) */}
              <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-[#040406] flex items-center justify-center">
                <div className="w-2 h-2 rounded-full bg-emerald-500" />
              </div>
            </div>
            <span className={cn(
              "text-[14px] font-medium transition-colors",
              member.id === user?.id ? "text-primary" : "text-white/60 group-hover:text-white/90"
            )}>
              {member.username}
            </span>
          </button>
        ))}
      </div>

      <ProfilePopup 
        userId={selectedProfileId || 0}
        isOpen={selectedProfileId !== null}
        onClose={() => setSelectedProfileId(null)}
        onEdit={openSettings}
      />
    </div>
  );
}
