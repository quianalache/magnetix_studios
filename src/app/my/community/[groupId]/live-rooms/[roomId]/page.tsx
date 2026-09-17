import { redirect } from "next/navigation";
import { getCurrentPerson } from "@/lib/server/person-session";
import { resolveFirstAgencyId } from "@/lib/landing/resolve-brand";
import { getAgencyMembershipForPerson, activateAgencyMembershipServerSide } from "@/lib/server/community-agency-service";
import { getAgencyLiveRoomServerSide } from "@/lib/server/agency-community-live-room-service";
import CommunityLiveRoomClient from "@/components/community/community-live-room-client";

export const dynamic = "force-dynamic";

/** Real Agency Community member access — join a standalone live room. */
export default async function MyAgencyCommunityLiveRoomPage({
  params,
}: {
  params: Promise<{ groupId: string; roomId: string }>;
}) {
  const { groupId, roomId } = await params;

  const person = await getCurrentPerson();
  if (!person) {
    redirect(`/my/login?next=${encodeURIComponent(`/my/community/${groupId}/live-rooms/${roomId}`)}`);
  }

  const agencyId = await resolveFirstAgencyId();
  if (!agencyId) {
    return <div className="mx-auto max-w-2xl p-8 text-center text-sm text-muted-foreground">Community not found.</div>;
  }
  const membership = await getAgencyMembershipForPerson(agencyId, groupId, person.id);
  if (!membership || membership.status === "removed") {
    return (
      <div className="mx-auto max-w-2xl p-8 text-center text-sm text-muted-foreground">
        You don&apos;t have access to this community.
      </div>
    );
  }
  if (membership.status === "pending") {
    await activateAgencyMembershipServerSide(agencyId, groupId, membership.id);
  }

  const room = await getAgencyLiveRoomServerSide(agencyId, groupId, roomId);
  if (!room || room.status !== "live") {
    return <div className="mx-auto max-w-2xl p-8 text-center text-sm text-muted-foreground">This room isn&apos;t live.</div>;
  }

  return (
    <CommunityLiveRoomClient
      saId=""
      groupId={groupId}
      roomId={roomId}
      joinPath={`/api/agency/community/${groupId}/live-rooms`}
      moderationPath={`/api/agency/community/${groupId}/live-rooms/moderation`}
      endPath={`/api/agency/community/${groupId}/live-rooms`}
      leaveHref={`/my/community/${groupId}`}
    />
  );
}
