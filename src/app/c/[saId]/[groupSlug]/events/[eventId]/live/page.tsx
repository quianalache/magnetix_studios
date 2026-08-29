import { notFound, redirect } from "next/navigation";
import { requireGroupPageAccess } from "@/lib/community/member-context";
import { getCommunityEventServerSide } from "@/lib/server/community-event-service";
import CommunityLiveRoomClient from "@/components/community/community-live-room-client";

export const dynamic = "force-dynamic";

export default async function CommunityEventLivePage({
  params,
}: {
  params: Promise<{ saId: string; groupSlug: string; eventId: string }>;
}) {
  const { saId, groupSlug, eventId } = await params;
  const access = await requireGroupPageAccess(saId, groupSlug);
  if (access.kind === "notFound") notFound();
  if (access.kind === "redirect") redirect(access.to);
  const event = await getCommunityEventServerSide(
    saId,
    access.group.id,
    eventId
  );
  if (
    !event ||
    event.status !== "live" ||
    event.locationType !== "magnetix_live"
  )
    notFound();
  return (
    <CommunityLiveRoomClient
      saId={saId}
      groupId={access.group.id}
      roomId={event.id}
      joinPath={`/api/community/${saId}/${access.group.id}/events/${event.id}/join`}
      moderationPath={`/api/community/${saId}/${access.group.id}/events/${event.id}/moderation`}
      endPath={`/api/community/${saId}/${access.group.id}/events`}
      leaveHref={`/c/${saId}/${groupSlug}/events`}
    />
  );
}
