"use client";

import { use } from "react";
import { useAuth } from "@/hooks/use-auth";
import CommunityLiveRoomClient from "@/components/community/community-live-room-client";

/** Agency Community Event — live join. Owner view. No companion feed post
 *  (postId: null) — Agency live sessions don't have a recording/replay
 *  pipeline yet, so there's nothing to attach in-room chat to; the room
 *  itself still works fully (see CommunityLiveRoomClient's own postId-null
 *  handling). */
export default function AgencyCommunityEventLivePage({
  params,
}: {
  params: Promise<{ groupId: string; eventId: string }>;
}) {
  const { groupId, eventId } = use(params);
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
      roomId={eventId}
      joinPath={`/api/agency/community/${groupId}/events/${eventId}/join`}
      moderationPath={`/api/agency/community/${groupId}/events/${eventId}/moderation`}
      endPath={`/api/agency/community/${groupId}/events`}
      leaveHref={`/agency/community/${groupId}/events`}
    />
  );
}
