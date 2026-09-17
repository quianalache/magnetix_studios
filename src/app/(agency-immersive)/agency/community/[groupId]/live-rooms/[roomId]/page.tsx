"use client";

import { use } from "react";
import { useAuth } from "@/hooks/use-auth";
import CommunityLiveRoomClient from "@/components/community/community-live-room-client";

/** Agency Community — join a standalone live room. Owner view. */
export default function AgencyCommunityLiveRoomPage({
  params,
}: {
  params: Promise<{ groupId: string; roomId: string }>;
}) {
  const { groupId, roomId } = use(params);
  const { agencyRole, loading: authLoading } = useAuth();
  const isOwner = agencyRole === "owner";

  if (authLoading) return null;
  if (!isOwner) {
    return (
      <div className="mx-auto max-w-2xl p-8 text-center text-sm text-muted-foreground">
        Community is managed by the agency owner.
      </div>
    );
  }

  return (
    <CommunityLiveRoomClient
      saId=""
      groupId={groupId}
      roomId={roomId}
      joinPath={`/api/agency/community/${groupId}/live-rooms`}
      moderationPath={`/api/agency/community/${groupId}/live-rooms/moderation`}
      endPath={`/api/agency/community/${groupId}/live-rooms`}
      leaveHref={`/agency/community/${groupId}`}
    />
  );
}
