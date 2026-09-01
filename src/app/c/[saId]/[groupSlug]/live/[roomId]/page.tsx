import { notFound, redirect } from "next/navigation";
import { requireGroupPageAccess } from "@/lib/community/member-context";
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
  return (
    <CommunityLiveRoomClient
      saId={saId}
      groupId={access.group.id}
      roomId={roomId}
    />
  );
}
