import "server-only";

import { LEVEL_THRESHOLDS } from "@/config/community";
import type { CommunityLevel, PointRuleMap } from "@/types/points-rewards";

/**
 * Default seed for a Community that has never configured Points & Rewards.
 * Two separate defaults, each preserving something that already existed:
 *
 *  - `DEFAULT_LEVELS`' thresholds are the EXACT pre-existing global
 *    `LEVEL_THRESHOLDS` from `config/community.ts` (not the mockup's
 *    example numbers) — so a Community with real members and real,
 *    already-earned points is never silently re-leveled the moment this
 *    feature ships. The NAMES are new (no per-level name concept existed
 *    before this feature), chosen as sensible generic defaults — the
 *    mockup's names were given as non-mandatory examples, so no specific
 *    name string needed to be preserved or matched.
 *  - `DEFAULT_POINT_RULES` are exactly the 6 V1 actions/values/limits from
 *    the approved spec.
 */
export const DEFAULT_LEVELS: readonly CommunityLevel[] = LEVEL_THRESHOLDS.map(
  (threshold, i) => ({
    level: i + 1,
    threshold,
    // Names from the approved Points & Rewards mockup (its own example
    // thresholds are NOT used here — see the module comment above).
    name: [
      "Newcomer",
      "Showstopper",
      "Rising Star",
      "Headliner",
      "Icon",
      "Trendsetter",
      "Luminary",
      "Legend",
      "Supernova",
    ][i],
  }),
);

export const DEFAULT_POINT_RULES: PointRuleMap = {
  create_post: {
    action: "create_post",
    label: "Create a post",
    description: "A member starts a new post in the community.",
    enabled: true,
    points: 1,
    limit: { type: "none" },
  },
  comment_post: {
    action: "comment_post",
    label: "Comment on a post",
    description: "A member leaves a top-level comment on a post.",
    enabled: true,
    points: 1,
    limit: { type: "none" },
  },
  reply_comment: {
    action: "reply_comment",
    label: "Reply to a comment",
    description: "A member replies to another comment.",
    enabled: true,
    points: 1,
    limit: { type: "none" },
  },
  share_video: {
    action: "share_video",
    label: "Share a video in a post",
    description:
      "A post includes a recognized video (a video link attachment). Overrides the normal post reward — a qualifying video post earns this amount total, not this plus the normal post amount.",
    enabled: true,
    points: 3,
    limit: { type: "none" },
  },
  like_post: {
    action: "like_post",
    label: "Like a post",
    description: "A member likes a post or comment.",
    enabled: true,
    points: 1,
    limit: { type: "per_day", maxPerDay: 10 },
  },
  invite_member: {
    action: "invite_member",
    label: "Invite a new member",
    description:
      "A member's personal invite link results in a new member successfully joining.",
    enabled: true,
    points: 5,
    limit: { type: "per_entity" },
  },
};
