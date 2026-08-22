/**
 * Community link builders — the "which URL shape does this page use" layer,
 * mirroring src/lib/domains/public-url.ts's "which domain" layer but for
 * INTERNAL relative navigation (Link hrefs, redirect() targets, fetch/router
 * paths) rather than externally-shared absolute URLs.
 *
 * Every opaque `/c/[saId]/...` route now has a "pretty" custom-domain
 * mirror under `/communities/...` (see src/app/communities/). The two route
 * families use different segment NAMES for the same logical page
 * (community -> home, classroom -> learning, leaderboards -> leaderboard),
 * so a plain prefix swap isn't enough — these builders are the one place
 * that knows the mapping, used by both server pages (redirect targets) and
 * client components (href props), so the two shapes can never drift apart.
 *
 * Deliberately NOT "server-only" — client components (CommunityShell,
 * JoinButton, feed/DM views, etc.) call these directly with a `pretty` flag
 * threaded down as a prop from the server page that already determined it
 * (see domain.ts). Opaque callers just pass `pretty: false` (or omit
 * `CommunityLinkBase.pretty` — every builder below treats a falsy value the
 * same as `false`), so nothing here changes behavior for the existing
 * shared-platform-domain experience.
 */

export interface CommunityLinkBase {
  saId: string;
  pretty: boolean;
}

export function communityAboutHref(b: CommunityLinkBase, groupSlug: string): string {
  return b.pretty ? `/communities/${groupSlug}/about` : `/c/${b.saId}/${groupSlug}`;
}

export function communityHomeHref(b: CommunityLinkBase, groupSlug: string): string {
  return b.pretty ? `/communities/${groupSlug}/home` : `/c/${b.saId}/${groupSlug}/community`;
}

export function communityPostHref(b: CommunityLinkBase, groupSlug: string, postId: string): string {
  return `${communityHomeHref(b, groupSlug)}/${postId}`;
}

export function communityLearningHref(b: CommunityLinkBase, groupSlug: string): string {
  return b.pretty ? `/communities/${groupSlug}/learning` : `/c/${b.saId}/${groupSlug}/classroom`;
}

export function communityLearningCourseHref(
  b: CommunityLinkBase,
  groupSlug: string,
  courseId: string,
): string {
  return `${communityLearningHref(b, groupSlug)}/${courseId}`;
}

export function communityLearningLessonHref(
  b: CommunityLinkBase,
  groupSlug: string,
  courseId: string,
  lessonId: string,
): string {
  return `${communityLearningCourseHref(b, groupSlug, courseId)}/${lessonId}`;
}

export function communityMembersHref(b: CommunityLinkBase, groupSlug: string): string {
  return b.pretty ? `/communities/${groupSlug}/members` : `/c/${b.saId}/${groupSlug}/members`;
}

export function communityLeaderboardHref(b: CommunityLinkBase, groupSlug: string): string {
  return b.pretty ? `/communities/${groupSlug}/leaderboard` : `/c/${b.saId}/${groupSlug}/leaderboards`;
}

export function communityProfileHref(b: CommunityLinkBase, groupSlug: string): string {
  return b.pretty ? `/communities/${groupSlug}/profile` : `/c/${b.saId}/${groupSlug}/profile`;
}

/** Moderator-only Community Settings workspace (General today; more sections later). */
export function communitySettingsHref(b: CommunityLinkBase, groupSlug: string): string {
  return b.pretty ? `/communities/${groupSlug}/settings` : `/c/${b.saId}/${groupSlug}/settings`;
}

/** Community Settings → Branding — same shape as General with `/branding`
 *  appended for both route families (they diverge on the segment BEFORE
 *  `/settings`, not after it), so no separate pretty/opaque branch needed. */
export function communitySettingsBrandingHref(b: CommunityLinkBase, groupSlug: string): string {
  return `${communitySettingsHref(b, groupSlug)}/branding`;
}

/** Community Settings → Navigation — same shape as Branding (diverges
 *  before `/settings`, not after it). */
export function communitySettingsNavigationHref(b: CommunityLinkBase, groupSlug: string): string {
  return `${communitySettingsHref(b, groupSlug)}/navigation`;
}

/**
 * Community Settings → Points & Rewards. ONE route (not one per tab) —
 * Overview/Points System/Levels/Rewards/Winners are client-side tabs
 * inside a single workspace, per the explicit "should feel like one
 * Settings area, not five separate routes" instruction. `?tab=` optionally
 * deep-links to a specific tab.
 */
export function communitySettingsPointsRewardsHref(
  b: CommunityLinkBase,
  groupSlug: string,
  tab?: string,
): string {
  const base = `${communitySettingsHref(b, groupSlug)}/points-rewards`;
  return tab ? `${base}?tab=${tab}` : base;
}

/** The group-less "enter your community" entry point — where messages/profile pages' "back" link goes, since they aren't group-scoped. */
export function communityRootHref(b: CommunityLinkBase): string {
  return b.pretty ? "/communities" : `/c/${b.saId}`;
}

export function communityLoginHref(
  b: CommunityLinkBase,
  opts?: { join?: string; next?: string; ref?: string },
): string {
  const base = b.pretty ? "/communities/login" : `/c/${b.saId}/login`;
  const qs = new URLSearchParams();
  if (opts?.join) qs.set("join", opts.join);
  if (opts?.next) qs.set("next", opts.next);
  // Points & Rewards — the inviting member's own memberId, carried through
  // sign-up so `joinGroupServerSide` can credit their "Invite a new
  // member" point on this visitor's first successful join. See
  // `login/route.ts` for where this gets consumed.
  if (opts?.ref) qs.set("ref", opts.ref);
  const q = qs.toString();
  return q ? `${base}?${q}` : base;
}

export function communityMessagesHref(b: CommunityLinkBase): string {
  return b.pretty ? "/communities/messages" : `/c/${b.saId}/messages`;
}

export function communityMessageThreadHref(b: CommunityLinkBase, threadId: string): string {
  return `${communityMessagesHref(b)}/${threadId}`;
}
