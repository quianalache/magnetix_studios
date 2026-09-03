import type { ClientPost } from "@/components/community/feed/feed-view";
import type { MenuItem } from "@/components/community/actions-menu";

/**
 * ONE canonical action set for a Community Post, consumed identically by
 * the feed card's menu and the opened post-detail's menu (2026-09-03 —
 * before this, each rendered its OWN inline item list and had drifted:
 * detail was missing "Open post"/"Copy link" the feed already had).
 * The set of items and their gating is entirely a function of
 * (post, viewer role, ownership) — never which surface is rendering it.
 * Callers differ only in HOW an action mutates their own local state
 * afterward, supplied as callbacks; a callback left `undefined` hides
 * that action rather than rendering a dead menu item (e.g. a surface
 * that doesn't support course-page pinning yet simply omits
 * `onPinToCourse`).
 *
 * "Report post" isn't included — there's no existing report/moderation-
 * queue infrastructure in this codebase to hook it into (verified: no
 * report data model, no moderator notification path), so it isn't a
 * "preserve existing" action and building one from scratch is out of
 * scope here.
 */
export interface PostActionCallbacks {
  /** Omitted (not just falsy) hides "Open post" — e.g. already open in detail. */
  onOpen?: () => void;
  onCopyLink: () => void;
  onEdit?: () => void;
  onTogglePin?: (target: "allPosts" | "channel") => void;
  onChangeChannel?: () => void;
  onToggleComments?: () => void;
  onPinToCourse?: () => void;
  onDelete?: () => void;
}

export function buildPostActionItems(
  post: Pick<
    ClientPost,
    | "authorMemberId"
    | "category"
    | "pinned"
    | "pinnedToChannel"
    | "commentsDisabled"
  >,
  viewer: { role: "member" | "moderator"; memberId: string },
  cb: PostActionCallbacks
): MenuItem[] {
  const canModerate = viewer.role === "moderator";
  // Same broad "moderator can act on any post" convention already used
  // throughout this feature (feed-view.tsx/post-detail-view.tsx) — not a
  // new permission concept introduced here.
  const isOwner = post.authorMemberId === viewer.memberId;
  const canEdit = canModerate || isOwner;
  const canDelete = canModerate || isOwner;

  const items: MenuItem[] = [];
  if (cb.onOpen) items.push({ label: "Open post", onClick: cb.onOpen });
  items.push({ label: "Copy link", onClick: cb.onCopyLink });
  if (canEdit && cb.onEdit)
    items.push({ label: "Edit post", onClick: cb.onEdit });
  if (canModerate && cb.onChangeChannel)
    items.push({ label: "Change Channel", onClick: cb.onChangeChannel });
  if (canModerate && cb.onTogglePin) {
    items.push({
      label: post.pinned ? "Unpin from All Posts" : "Pin to All Posts",
      onClick: () => cb.onTogglePin!("allPosts"),
    });
    // A post with no channel/category can't be pinned to one — hidden
    // entirely rather than shown disabled (existing convention this
    // action set already followed before being unified).
    if (post.category)
      items.push({
        label: post.pinnedToChannel ? "Unpin from Channel" : "Pin to Channel",
        onClick: () => cb.onTogglePin!("channel"),
      });
  }
  if (canModerate && cb.onPinToCourse)
    items.push({ label: "Pin to Course Page", onClick: cb.onPinToCourse });
  if (canModerate && cb.onToggleComments)
    items.push({
      label: post.commentsDisabled ? "Turn on comments" : "Turn off comments",
      onClick: cb.onToggleComments,
    });
  if (canDelete && cb.onDelete)
    items.push({
      label: "Delete post",
      onClick: cb.onDelete,
      destructive: true,
    });

  return items;
}
