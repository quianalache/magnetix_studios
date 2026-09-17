import { redirect } from "next/navigation";
import { getCurrentPerson } from "@/lib/server/person-session";
import { resolveFirstAgencyId } from "@/lib/landing/resolve-brand";
import {
  getAgencyGroupById,
  getAgencyMembershipForPerson,
  activateAgencyMembershipServerSide,
  getAgencyInaccessibleChannelNames,
} from "@/lib/server/community-agency-service";
import { agencyMemberDisplayName } from "@/lib/server/agency-community-access";
import { listAgencyEventsServerSide } from "@/lib/server/agency-community-event-service";
import { CommunityShell } from "@/components/community/community-shell";
import { CommunityEventsView, type CommunityEventViewModel } from "@/components/community/community-events-view";

export const dynamic = "force-dynamic";

function serialize(event: Awaited<ReturnType<typeof listAgencyEventsServerSide>>[number]): CommunityEventViewModel {
  const ms = (value: unknown) => {
    const v = value as { toMillis?: () => number; seconds?: number } | null;
    return typeof v?.toMillis === "function" ? v.toMillis() : v?.seconds ? v.seconds * 1000 : null;
  };
  return { ...event, startAt: ms(event.startAt), endAt: ms(event.endAt) } as CommunityEventViewModel;
}

/** Real Agency Community member access — Events. Same access pattern as
 *  the feed page (see that file's doc comment). */
export default async function MyAgencyCommunityEventsPage({
  params,
}: {
  params: Promise<{ groupId: string }>;
}) {
  const { groupId } = await params;

  const person = await getCurrentPerson();
  if (!person) redirect(`/my/login?next=${encodeURIComponent(`/my/community/${groupId}/events`)}`);

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

  const [events, inaccessible] = await Promise.all([
    listAgencyEventsServerSide(agencyId, groupId),
    getAgencyInaccessibleChannelNames({ agencyId, groupId, isModerator: false }),
  ]);
  const visibleEvents = events.filter((e) => !e.channel || !inaccessible.has(e.channel));

  const viewer = {
    memberId: person.id,
    displayName: agencyMemberDisplayName(membership),
    avatarUrl: null,
    level: 1,
  };

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
      <CommunityEventsView
        saId=""
        agencyGroupId={groupId}
        agencyMemberView
        groupId={group.id}
        groupSlug={group.slug}
        categories={group.categories}
        initialEvents={visibleEvents.map(serialize)}
        moderator={false}
      />
    </CommunityShell>
  );
}
