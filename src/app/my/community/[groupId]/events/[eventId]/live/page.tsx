import { redirect } from "next/navigation";
import { getCurrentPerson } from "@/lib/server/person-session";
import { resolveFirstAgencyId } from "@/lib/landing/resolve-brand";
import { getAgencyMembershipForPerson, activateAgencyMembershipServerSide } from "@/lib/server/community-agency-service";
import { getAgencyEventServerSide } from "@/lib/server/agency-community-event-service";
import CommunityLiveRoomClient from "@/components/community/community-live-room-client";

export const dynamic = "force-dynamic";

/** Real Agency Community member access — join a live event. No companion
 *  feed post (postId: null) — see the owner live page's own doc comment. */
export default async function MyAgencyCommunityEventLivePage({
  params,
}: {
  params: Promise<{ groupId: string; eventId: string }>;
}) {
  const { groupId, eventId } = await params;

  const person = await getCurrentPerson();
  if (!person) {
    redirect(`/my/login?next=${encodeURIComponent(`/my/community/${groupId}/events/${eventId}/live`)}`);
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

  const event = await getAgencyEventServerSide(agencyId, groupId, eventId);
  if (!event || event.status !== "live" || event.locationType !== "magnetix_live") {
    return <div className="mx-auto max-w-2xl p-8 text-center text-sm text-muted-foreground">This event isn&apos;t live.</div>;
  }

  return (
    <CommunityLiveRoomClient
      saId=""
      groupId={groupId}
      roomId={eventId}
      joinPath={`/api/agency/community/${groupId}/events/${eventId}/join`}
      moderationPath={`/api/agency/community/${groupId}/events/${eventId}/moderation`}
      endPath={`/api/agency/community/${groupId}/events`}
      leaveHref={`/my/community/${groupId}/events`}
    />
  );
}
