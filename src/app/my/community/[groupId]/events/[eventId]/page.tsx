import { redirect } from "next/navigation";
import { getCurrentPerson } from "@/lib/server/person-session";
import { resolveFirstAgencyId } from "@/lib/landing/resolve-brand";
import {
  getAgencyGroupById,
  getAgencyMembershipForPerson,
  activateAgencyMembershipServerSide,
} from "@/lib/server/community-agency-service";
import { agencyMemberDisplayName } from "@/lib/server/agency-community-access";
import { getAgencyEventServerSide } from "@/lib/server/agency-community-event-service";
import { CommunityShell } from "@/components/community/community-shell";
import { CommunityEventDetailView } from "@/components/community/community-event-detail-view";
import type { CommunityEventViewModel } from "@/components/community/community-events-view";

export const dynamic = "force-dynamic";

function serialize(
  event: NonNullable<Awaited<ReturnType<typeof getAgencyEventServerSide>>>,
): CommunityEventViewModel {
  const ms = (v: unknown) => {
    const value = v as { toMillis?: () => number; seconds?: number } | null;
    return typeof value?.toMillis === "function" ? value.toMillis() : value?.seconds ? value.seconds * 1000 : null;
  };
  return { ...event, startAt: ms(event.startAt), endAt: ms(event.endAt) } as CommunityEventViewModel;
}

/** Real Agency Community member access — Event detail. */
export default async function MyAgencyCommunityEventDetailPage({
  params,
}: {
  params: Promise<{ groupId: string; eventId: string }>;
}) {
  const { groupId, eventId } = await params;

  const person = await getCurrentPerson();
  if (!person) {
    redirect(`/my/login?next=${encodeURIComponent(`/my/community/${groupId}/events/${eventId}`)}`);
  }

  const agencyId = await resolveFirstAgencyId();
  const group = agencyId ? await getAgencyGroupById(agencyId, groupId) : null;
  if (!agencyId || !group) {
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
  if (!event) {
    return <div className="mx-auto max-w-2xl p-8 text-center text-sm text-muted-foreground">Event not found.</div>;
  }

  const viewer = {
    memberId: person.id,
    displayName: agencyMemberDisplayName(membership),
    avatarUrl: null,
    level: 1,
  };
  const base = `/my/community/${groupId}/events`;

  return (
    <CommunityShell
      saId=""
      agencyGroupId={groupId}
      agencyMemberView
      group={group}
      active="events"
      viewer={viewer}
      viewerIsModerator={false}
      embedded={false}
    >
      <CommunityEventDetailView
        event={serialize(event)}
        apiPath={`/api/agency/community/${groupId}/events`}
        eventsHref={base}
        liveHref={`${base}/${event.id}/live`}
        moderator={false}
      />
    </CommunityShell>
  );
}
