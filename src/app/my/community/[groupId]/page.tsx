import { redirect } from "next/navigation";
import { getCurrentPerson } from "@/lib/server/person-session";
import { resolveFirstAgencyId, resolveBrandName } from "@/lib/landing/resolve-brand";
import {
  getAgencyGroupById,
  getAgencyMembershipForPerson,
  activateAgencyMembershipServerSide,
  listAgencyFeed,
  isAgencyPostLikedByViewer,
  viewerAgencyPollVotes,
  listAgencyChannelsAndSectionsForViewer,
} from "@/lib/server/community-agency-service";
import { agencyMemberDisplayName } from "@/lib/server/agency-community-access";
import { buildFeedPoll } from "@/lib/server/community-feed-service";
import { renderCommunityPostHtml } from "@/lib/community/post-html";
import {
  CommunityShell,
  COMMUNITY_DEFAULT_BRAND,
} from "@/components/community/community-shell";
import { FeedView, type ClientPost } from "@/components/community/feed/feed-view";
import { CommunityBanner } from "@/components/community/community-banner";
import { CommunityLeftNav } from "@/components/community/community-left-nav";
import { resolveCommunityTheme } from "@/lib/community/community-theme-presets";

export const dynamic = "force-dynamic";

function toMillis(v: unknown): number | null {
  const m = v as { toMillis?: () => number } | null;
  return typeof m?.toMillis === "function" ? m.toMillis() : null;
}

/**
 * Real Agency Community member access — the customer-facing entry point
 * (`/my/community/[groupId]`, NOT `/agency/community/[groupId]` — that
 * stays the owner's admin route). Server Component, matching every other
 * `/my/**` page's own convention (see `/my/(app)/layout.tsx`): gates on
 * `mm_session` via `getCurrentPerson()`, then independently re-derives a
 * real, persisted membership doc scoped by this exact personId — the same
 * security pattern `/api/my/enter` uses, applied directly here rather than
 * through a second session-minting hop, since this route is NOT bridging
 * into some other system's cookie gate; it IS the gate.
 */
export default async function MyAgencyCommunityPage({
  params,
}: {
  params: Promise<{ groupId: string }>;
}) {
  const { groupId } = await params;

  const person = await getCurrentPerson();
  if (!person) {
    redirect(`/my/login?next=${encodeURIComponent(`/my/community/${groupId}`)}`);
  }

  const agencyId = await resolveFirstAgencyId();
  if (!agencyId) {
    return (
      <div className="mx-auto max-w-2xl p-8 text-center text-sm text-muted-foreground">
        Community not found.
      </div>
    );
  }

  const group = await getAgencyGroupById(agencyId, groupId);
  if (!group) {
    return (
      <div className="mx-auto max-w-2xl p-8 text-center text-sm text-muted-foreground">
        Community not found.
      </div>
    );
  }

  const membership = await getAgencyMembershipForPerson(agencyId, groupId, person.id);
  if (!membership || membership.status === "removed") {
    return (
      <div className="mx-auto max-w-2xl p-8 text-center text-sm text-muted-foreground">
        You don&apos;t have access to this community. If you think this is a
        mistake, ask whoever invited you to re-send your invite.
      </div>
    );
  }
  if (membership.status === "pending") {
    await activateAgencyMembershipServerSide(agencyId, groupId, membership.id);
  }

  const [posts, brandName, { channels, sections }] = await Promise.all([
    listAgencyFeed(agencyId, groupId, false),
    resolveBrandName(),
    listAgencyChannelsAndSectionsForViewer({ agencyId, groupId, isModerator: false }),
  ]);
  const pollPostIds = posts.filter((p) => p.poll).map((p) => p.id);
  const pollVotes = await viewerAgencyPollVotes(agencyId, groupId, pollPostIds, person.id);
  const clientPosts: ClientPost[] = await Promise.all(
    posts.map(async (p) => ({
      id: p.id,
      authorMemberId: p.authorMemberId,
      title: p.title,
      body: renderCommunityPostHtml(p.body),
      attachments: p.attachments,
      category: p.category,
      commentsDisabled: p.commentsDisabled,
      pinned: p.pinned,
      pinnedAtMs: toMillis(p.pinnedAt),
      pinnedToChannel: p.pinnedToChannel === true,
      channelPinnedAtMs: toMillis(p.channelPinnedAt),
      likeCount: p.likeCount,
      commentCount: p.commentCount,
      createdAtMs: toMillis(p.createdAt),
      author: {
        memberId: p.authorMemberId,
        displayName: p.authorDisplayName ?? brandName,
        avatarUrl: p.authorAvatarUrl ?? null,
        level: 1,
      },
      likedByViewer: await isAgencyPostLikedByViewer(agencyId, groupId, p.id, person.id),
      poll: p.poll ? buildFeedPoll(p.poll, pollVotes.get(p.id) ?? null, false) : undefined,
    })),
  );

  const resolvedTheme = resolveCommunityTheme(group);
  const brand = resolvedTheme.primary || COMMUNITY_DEFAULT_BRAND;
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
      active="community"
      viewer={viewer}
      viewerIsModerator={false}
      embedded={false}
    >
      <div className="space-y-4">
        {(group.showBanner ?? true) && <CommunityBanner group={group} />}
        <div className="grid gap-6 md:grid-cols-[200px_1fr]">
          <div className="min-w-0">
            <CommunityLeftNav
              saId=""
              agencyGroupId={groupId}
              agencyMemberView
              groupId={group.id}
              groupSlug={group.slug}
              brand={brand}
              primaryAction={resolvedTheme.primaryAction}
              viewer={{ memberId: viewer.memberId, role: "member" }}
              initialChannels={channels}
              initialSections={sections}
            />
          </div>
          <div className="min-w-0">
            <FeedView
              saId=""
              agencyGroupId={groupId}
              agencyMemberView
              groupId={group.id}
              groupSlug={group.slug}
              brand={brand}
              communityName={group.name}
              categories={group.categories}
              viewer={{ ...viewer, role: "member" }}
              initialPosts={clientPosts}
            />
          </div>
        </div>
      </div>
    </CommunityShell>
  );
}
