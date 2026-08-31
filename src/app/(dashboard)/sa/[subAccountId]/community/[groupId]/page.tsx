import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { requireStaffGroupPageAccess } from "@/lib/community/member-context";
import { listFeed } from "@/lib/server/community-feed-service";
import { listChannelsAndSectionsForViewer } from "@/lib/server/community-channels-service";
import {
  getLeaderboard,
  listMemberDirectory,
} from "@/lib/server/community-leaderboard-service";
import { listCommunityReviews } from "@/lib/server/community-service";
import {
  CommunityShell,
  COMMUNITY_DEFAULT_BRAND,
} from "@/components/community/community-shell";
import {
  FeedView,
  type ClientPost,
} from "@/components/community/feed/feed-view";
import { renderCommunityPostHtml } from "@/lib/community/post-html";
import { CommunityBanner } from "@/components/community/community-banner";
import { CommunityLeftNav } from "@/components/community/community-left-nav";
import { AboutCommunityCard } from "@/components/community/about-community-card";
import { TopContributorsCard } from "@/components/community/top-contributors-card";
import { SidebarContentCard } from "@/components/community/sidebar-content-card";
import { GuidelinesCard } from "@/components/community/guidelines-card";
import { resolveCommunityTheme } from "@/lib/community/community-theme-presets";
import type { AuthorView } from "@/types/community";

const ONLINE_WINDOW_MS = 5 * 60 * 1000;

export const dynamic = "force-dynamic";

function toMillis(v: unknown): number | null {
  if (!v) return null;
  const m = v as {
    toMillis?: () => number;
    toDate?: () => Date;
    seconds?: number;
    _seconds?: number;
  };
  if (typeof m.toMillis === "function") return m.toMillis();
  if (typeof m.toDate === "function") return m.toDate().getTime();
  if (typeof m.seconds === "number") return m.seconds * 1000;
  if (typeof m._seconds === "number") return m._seconds * 1000;
  return null;
}

/**
 * Staff Community-in-CRM — the real feed, rendered natively inside the CRM
 * shell (the (dashboard)/sa/[subAccountId] layout already wraps this with
 * the Sidebar/Header). Deliberately a close mirror of
 * /c/[saId]/[groupSlug]/community/page.tsx — same data fetching, same
 * FeedView/CommunityLeftNav components, unchanged — the only real
 * differences are the staff auth check and CommunityShell's `staffGroupId`
 * (embedded rendering + staff-shaped internal links). See the Staff
 * Community Integration report.
 */
export default async function StaffCommunityFeedPage({
  params,
}: {
  params: Promise<{ subAccountId: string; groupId: string }>;
}) {
  const { subAccountId: saId, groupId } = await params;
  const access = await requireStaffGroupPageAccess(
    saId,
    groupId,
    `/sa/${saId}/community/${groupId}`
  );
  if (access.kind === "notFound") notFound();
  if (access.kind === "redirect") redirect(access.to);

  const { group, member, membership, gate } = access;
  // Theme parity fix (2026-08-29) — same shared resolver Branding's live
  // preview reads, so `brand` and `primaryAction` are guaranteed to match
  // whatever the preview showed for this group's saved theme. See
  // resolveCommunityTheme's own doc comment for the legacy-fallback rule.
  const resolvedTheme = resolveCommunityTheme(group);
  const brand = resolvedTheme.primary || COMMUNITY_DEFAULT_BRAND;

  const viewer: AuthorView = {
    memberId: member.id,
    displayName:
      member.displayName?.trim() || member.email.split("@")[0] || "Member",
    avatarUrl: member.avatarUrl,
    level: membership.level,
  };

  const viewerIsModerator = membership.role === "moderator";
  const feed = await listFeed({
    subAccountId: saId,
    groupId: group.id,
    viewerMemberId: member.id,
    viewerIsModerator,
  });
  const { channels, sections } = await listChannelsAndSectionsForViewer({
    subAccountId: saId,
    groupId: group.id,
    isModerator: viewerIsModerator,
  });
  const clientChannels = channels.map((c) => ({
    ...c,
    createdAt: null,
    updatedAt: null,
  }));
  const clientSections = sections.map((s) => ({
    ...s,
    createdAt: null,
    updatedAt: null,
  }));

  const posts: ClientPost[] = feed.map((p) => ({
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
    author: p.author,
    likedByViewer: p.likedByViewer,
    poll: p.poll,
    postType: p.postType,
    liveSessionId: p.liveSessionId,
    liveRoomId: p.liveRoomId,
    liveMode: p.liveMode,
    liveStatus: p.liveStatus,
    thumbnailUrl: p.thumbnailUrl,
  }));

  void gate;

  const [topMembers, directory, reviews] = await Promise.all([
    getLeaderboard({
      subAccountId: saId,
      groupId: group.id,
      window: "all",
      limit: 5,
    }),
    listMemberDirectory({ subAccountId: saId, groupId: group.id }),
    // "Leave a review" moved here from the public About page (2026-08-30
    // corrections, Part B) — see the member Home page's identical comment.
    listCommunityReviews({ subAccountId: saId, groupId: group.id, limit: 24 }),
  ]);
  const currentReview = reviews.find((r) => r.memberId === member.id) ?? null;

  const now = Date.now();
  const activeMembers = directory.filter((r) => r.status === "active");
  const isOnline = (ms: number | null) => !!ms && now - ms < ONLINE_WINDOW_MS;
  const memberCount = activeMembers.length;
  const onlineCount = activeMembers.filter((r) =>
    isOnline(r.lastSeenAtMs)
  ).length;
  const adminCount = activeMembers.filter((r) => r.role === "moderator").length;

  const sidebarCards = (group.sidebarCards ?? [])
    .slice()
    .sort((a, b) => a.order - b.order);

  return (
    <CommunityShell
      saId={saId}
      group={group}
      active="community"
      viewer={viewer}
      viewerIsModerator={viewerIsModerator}
      staffGroupId={groupId}
      rightRail={
        <>
          <AboutCommunityCard
            group={group}
            brand={brand}
            accent={resolvedTheme.accent}
            memberCount={memberCount}
            onlineCount={onlineCount}
            adminCount={adminCount}
            saId={saId}
            groupId={group.id}
            currentReview={currentReview}
          />
          <TopContributorsCard
            saId={saId}
            pretty={false}
            staffGroupId={groupId}
            groupSlug={group.slug}
            brand={brand}
            members={topMembers}
          />
          {sidebarCards.map((card) => (
            <SidebarContentCard key={card.id} card={card} brand={brand} />
          ))}
          <GuidelinesCard guidelinesHtml={group.guidelinesHtml ?? ""} />
        </>
      }
    >
      <div className="space-y-4">
        {(group.showBanner ?? true) && <CommunityBanner group={group} />}
        <Suspense fallback={null}>
          <div className="grid gap-6 md:grid-cols-[200px_1fr]">
            <div className="min-w-0">
              <CommunityLeftNav
                saId={saId}
                pretty={false}
                staffGroupId={groupId}
                groupId={group.id}
                groupSlug={group.slug}
                brand={brand}
                primaryAction={resolvedTheme.primaryAction}
                viewer={{ memberId: member.id, role: membership.role }}
                initialChannels={clientChannels}
                initialSections={clientSections}
              />
            </div>
            <div className="min-w-0">
              <FeedView
                saId={saId}
                pretty={false}
                staffGroupId={groupId}
                groupId={group.id}
                groupSlug={group.slug}
                brand={brand}
                communityName={group.name}
                categories={group.categories}
                viewer={{
                  memberId: member.id,
                  role: membership.role,
                  displayName: viewer.displayName,
                  avatarUrl: viewer.avatarUrl,
                  level: viewer.level,
                }}
                initialPosts={posts}
              />
            </div>
          </div>
        </Suspense>
      </div>
    </CommunityShell>
  );
}
