import { notFound, redirect } from "next/navigation";
import { requireStaffGroupPageAccess } from "@/lib/community/member-context";
import { getCommunityLiveRoomServerSide } from "@/lib/server/community-live-room-service";
import CommunityLiveRoomClient from "@/components/community/community-live-room-client";

export const dynamic = "force-dynamic";

export default async function StaffCommunityLiveRoomPage({
  params,
}: {
  params: Promise<{ subAccountId: string; groupId: string; roomId: string }>;
}) {
  const { subAccountId: saId, groupId, roomId } = await params;
  const access = await requireStaffGroupPageAccess(
    saId,
    groupId,
    `/sa/${saId}/community/${groupId}/live/${roomId}`
  );
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
      leaveHref={`/sa/${saId}/community/${groupId}`}
    />
  );
}
