import { notFound, redirect } from "next/navigation";
import { requireGroupPageAccess } from "@/lib/community/member-context";
import { getCommunityEventServerSide } from "@/lib/server/community-event-service";
import { isCommunityPrettyRequest } from "@/lib/community/domain";
import { getInaccessibleChannelNames } from "@/lib/server/community-channels-service";
import { CommunityShell } from "@/components/community/community-shell";
import { CommunityEventDetailView } from "@/components/community/community-event-detail-view";
import type { CommunityEventViewModel } from "@/components/community/community-events-view";
import type { AuthorView } from "@/types/community";

function serialize(
  event: NonNullable<Awaited<ReturnType<typeof getCommunityEventServerSide>>>
): CommunityEventViewModel {
  const ms = (v: unknown) => {
    const value = v as { toMillis?: () => number; seconds?: number } | null;
    return typeof value?.toMillis === "function"
      ? value.toMillis()
      : value?.seconds
        ? value.seconds * 1000
        : null;
  };
  return {
    ...event,
    startAt: ms(event.startAt),
    endAt: ms(event.endAt),
  } as CommunityEventViewModel;
}
export default async function CommunityEventDetailPage({
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
  if (!event) notFound();
  if (access.membership.role !== "moderator" && event.channel) {
    const inaccessible = await getInaccessibleChannelNames({
      subAccountId: saId,
      groupId: access.group.id,
      isModerator: false,
    });
    if (inaccessible.has(event.channel)) notFound();
  }
  const viewer: AuthorView = {
    memberId: access.member.id,
    displayName:
      access.member.displayName?.trim() ||
      access.member.email.split("@")[0] ||
      "Member",
    avatarUrl: access.member.avatarUrl,
    level: access.membership.level,
  };
  const pretty = await isCommunityPrettyRequest(saId);
  const base = pretty
    ? `/communities/${groupSlug}/events`
    : `/c/${saId}/${groupSlug}/events`;
  return (
    <CommunityShell
      saId={saId}
      pretty={pretty}
      group={access.group}
      active="events"
      viewer={viewer}
      viewerIsModerator={access.membership.role === "moderator"}
    >
      <CommunityEventDetailView
        event={serialize(event)}
        apiPath={`/api/community/${saId}/${access.group.id}/events`}
        eventsHref={base}
        liveHref={`${base}/${event.id}/live`}
        moderator={access.membership.role === "moderator"}
      />
    </CommunityShell>
  );
}
