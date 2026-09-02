import { notFound, redirect } from "next/navigation";
import { requireGroupPageAccess } from "@/lib/community/member-context";
import { isCommunityPrettyRequest } from "@/lib/community/domain";
import { communityHomeHref } from "@/lib/community/routes";
import { getCommunityLiveRoomServerSide } from "@/lib/server/community-live-room-service";
import CommunityLiveRoomClient from "@/components/community/community-live-room-client";

export const dynamic = "force-dynamic";

export default async function CommunityLiveRoomPage({
  params,
}: {
  params: Promise<{ saId: string; groupSlug: string; roomId: string }>;
}) {
  const { saId, groupSlug, roomId } = await params;
  const access = await requireGroupPageAccess(saId, groupSlug, {
    opaque: `/c/${saId}/${groupSlug}/live/${roomId}`,
    pretty: `/communities/${groupSlug}/live/${roomId}`,
  });
  if (access.kind === "notFound") notFound();
  if (access.kind === "redirect") redirect(access.to);
  const room = await getCommunityLiveRoomServerSide(
    saId,
    access.group.id,
    roomId
  );
  if (!room || room.status !== "live") notFound();
  const pretty = await isCommunityPrettyRequest(saId);
  return (
    <CommunityLiveRoomClient
      saId={saId}
      groupId={access.group.id}
      roomId={roomId}
      // 2026-09-02 wrong-community redirect fix: without this, End Session
      // fell back to CommunityLiveRoomClient's default leaveHref
      // (`/c/{saId}` — the whole sub-account's community index, not THIS
      // group), which for any sub-account running more than one community
      // sent the host somewhere else entirely. Uses the exact same
      // route-builder the rest of this group's own navigation already
      // does, so it can never drift from what "this community" means.
      leaveHref={communityHomeHref({ saId, pretty }, groupSlug)}
    />
  );
}
