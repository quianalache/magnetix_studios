"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { MessageCircle, ThumbsUp } from "lucide-react";
import type { AuthorView } from "@/types/community";
import type { MediaAttachment } from "@/types/media-attachment";
import { MemberAvatar } from "@/components/community/member-avatar";
import { ActionsMenu, type MenuItem } from "@/components/community/actions-menu";
import { AuthorLink } from "@/components/community/author-link";
import { CommunityPostBody } from "@/components/community/feed/community-post-body";
import { CommunityPostAttachments } from "@/components/community/feed/community-post-attachments";
import { CommunityPollCard } from "@/components/community/feed/community-poll-card";
import { PostComposer } from "@/components/community/feed/post-composer";
import { CommentComposer, type ReplyTarget } from "@/components/community/feed/comment-composer";
import { communityHomeHref } from "@/lib/community/routes";
import { cn } from "@/lib/utils";
import type { ClientPost } from "./feed-view";

export interface ClientComment {
  id: string;
  body: string;
  likeCount: number;
  likedByViewer: boolean;
  createdAtMs: number | null;
  parentId: string | null;
  author: AuthorView;
  /** Comments & Replies (2026-08-19) — additive; absent on every comment
   *  written before this existed, same convention as ClientPost.attachments. */
  attachments?: MediaAttachment[];
  /** Drives the "Edited" label — existence only, no exact timestamp shown. */
  edited?: boolean;
}

interface Viewer {
  memberId: string;
  role: "member" | "moderator";
  displayName: string;
  avatarUrl: string | null;
  level: number;
}

function timeAgo(ms: number | null): string {
  if (!ms) return "";
  const s = Math.floor((Date.now() - ms) / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

export function PostDetailView({
  saId,
  pretty = false,
  groupId,
  groupSlug,
  brand,
  categories,
  post,
  initialComments,
  viewer,
}: {
  saId: string;
  /** True when serving `saId`'s own verified custom domain — see domain.ts. */
  pretty?: boolean;
  groupId: string;
  groupSlug: string;
  brand: string;
  categories: string[];
  post: ClientPost;
  initialComments: ClientComment[];
  viewer: Viewer;
}) {
  const router = useRouter();
  const [liked, setLiked] = useState(post.likedByViewer);
  const [likeCount, setLikeCount] = useState(post.likeCount);
  const [pinned, setPinned] = useState(post.pinned);
  const [currentPost, setCurrentPost] = useState(post);
  const [editing, setEditing] = useState(false);
  const [comments, setComments] = useState(initialComments);
  const [replyTarget, setReplyTarget] = useState<ReplyTarget | null>(null);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const base = `/api/community/${saId}/${groupId}`;

  const topLevel = comments.filter((c) => !c.parentId);
  const repliesOf = (id: string) => comments.filter((c) => c.parentId === id);

  async function togglePostLike() {
    setLiked((v) => !v);
    setLikeCount((c) => c + (liked ? -1 : 1));
    try {
      const res = await fetch(`${base}/posts/${post.id}/like`, { method: "POST" });
      if (!res.ok) throw new Error();
    } catch {
      setLiked((v) => !v);
      setLikeCount((c) => c + (liked ? 1 : -1));
    }
  }

  async function togglePin() {
    const next = !pinned;
    setPinned(next);
    const res = await fetch(`${base}/posts/${post.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pinned: next }),
    });
    if (!res.ok) {
      setPinned(!next);
      toast.error("Couldn't update pin");
    }
  }

  async function deletePost() {
    if (!confirm("Delete this post?")) return;
    const res = await fetch(`${base}/posts/${post.id}`, { method: "DELETE" });
    if (res.ok) {
      toast.success("Post deleted");
      router.push(communityHomeHref({ saId, pretty }, groupSlug));
    } else {
      toast.error("Couldn't delete");
    }
  }

  async function submitVote(optionIds: string[]) {
    const res = await fetch(`${base}/posts/${post.id}/poll/vote`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ optionIds }),
    });
    const d = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; poll?: unknown };
    if (!res.ok || !d.ok) {
      toast.error(d.error ?? "Couldn't record your vote");
      throw new Error(d.error ?? "vote failed");
    }
    setCurrentPost((p) => ({ ...p, poll: d.poll as ClientPost["poll"] }));
  }

  async function toggleCommentLike(id: string) {
    setComments((prev) =>
      prev.map((c) =>
        c.id === id
          ? {
              ...c,
              likedByViewer: !c.likedByViewer,
              likeCount: c.likeCount + (c.likedByViewer ? -1 : 1),
            }
          : c,
      ),
    );
    try {
      const res = await fetch(`${base}/posts/${post.id}/comments/${id}/like`, {
        method: "POST",
      });
      if (!res.ok) throw new Error();
    } catch {
      router.refresh();
    }
  }

  async function deleteComment(id: string) {
    if (!confirm("Delete this comment?")) return;
    const prev = comments;
    // Remove the comment and any replies hanging off it. The server now
    // ACTUALLY cascade-deletes the replies + their attachment Storage
    // objects too (deleteCommentServerSide, fixed 2026-08-19) — this
    // client-side filter just keeps the UI in sync with that real delete,
    // it isn't papering over a server gap the way it used to.
    setComments((c) => c.filter((x) => x.id !== id && x.parentId !== id));
    if (replyTarget?.parentId === id) setReplyTarget(null);
    try {
      const res = await fetch(`${base}/posts/${post.id}/comments/${id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error();
    } catch {
      setComments(prev);
      toast.error("Couldn't delete comment");
    }
  }

  /** Clicking Reply on ANY bubble (top-level or a reply) always targets
   *  the AUTHOR OF THAT SPECIFIC BUBBLE for the "Replying to @X" banner
   *  and auto-mention — but the effective parentId mirrors the server's
   *  own resolveCommentParentId exactly: a reply's OWN parentId (its true
   *  top-level ancestor) when replying to a reply, or the bubble's own id
   *  when it's already top-level. This is what keeps a reply-to-a-reply
   *  rendering at the same second visual level instead of a third. */
  function startReply(c: ClientComment) {
    const parentId = c.parentId ?? c.id;
    setReplyTarget({ parentId, mentionMemberId: c.author.memberId, mentionLabel: c.author.displayName });
  }

  const canModerate = viewer.role === "moderator";
  // Same broad "moderator can act on any post" convention as
  // canModerate/Delete below — not a new permission concept.
  const canEdit = canModerate || currentPost.author.memberId === viewer.memberId;
  const postMenu: MenuItem[] = [
    ...(canEdit ? [{ label: "Edit post", onClick: () => setEditing(true) }] : []),
    ...(canModerate
      ? [{ label: pinned ? "Unpin post" : "Pin post", onClick: togglePin }]
      : []),
    ...(canModerate || currentPost.author.memberId === viewer.memberId
      ? [{ label: "Delete post", onClick: deletePost, destructive: true }]
      : []),
  ];

  if (editing) {
    return (
      <div className="space-y-4">
        <PostComposer
          saId={saId}
          groupId={groupId}
          brand={brand}
          categories={categories}
          viewer={viewer}
          mode="edit"
          editingPost={currentPost}
          onSaved={(updated) => {
            setCurrentPost(updated);
            setEditing(false);
          }}
          onCancel={() => setEditing(false)}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Post */}
      <article className="rounded-xl border border-[#E4E4E4] bg-white p-5">
        <div className="flex items-start gap-3">
          <MemberAvatar author={currentPost.author} size={44} brand={brand} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-sm">
              <AuthorLink
                saId={saId}
                pretty={pretty}
                viewerMemberId={viewer.memberId}
                author={currentPost.author}
                brand={brand}
              />
              <span className="text-xs text-[#909090]">
                {timeAgo(currentPost.createdAtMs)}
              </span>
              {currentPost.category && (
                <span className="text-xs text-[#909090]">· {currentPost.category}</span>
              )}
            </div>
            {currentPost.title && (
              <h1 className="mt-1 text-lg font-semibold text-[#202124]">
                {currentPost.title}
              </h1>
            )}
            <CommunityPostBody
              html={currentPost.body}
              brand={brand}
              className="mt-1"
              saId={saId}
              pretty={pretty}
              groupSlug={groupSlug}
            />
            <CommunityPostAttachments attachments={currentPost.attachments} brand={brand} className="mt-2" />
            {currentPost.poll && (
              <CommunityPollCard poll={currentPost.poll} brand={brand} onVote={submitVote} />
            )}
            <div className="mt-3 flex items-center gap-2 border-t border-[#f0f0f0] pt-3 text-sm">
              <button
                onClick={togglePostLike}
                className={cn(
                  "flex items-center gap-1.5 rounded-md border border-[#E4E4E4] px-2.5 py-1 text-xs font-medium hover:bg-[#F8F7F5]",
                  liked ? "text-[#202124]" : "text-[#909090]",
                )}
              >
                <ThumbsUp
                  className={cn("h-4 w-4", liked && "fill-current")}
                  style={liked ? { color: brand } : undefined}
                />
                {liked ? "Liked" : "Like"}
                {likeCount > 0 && (
                  <span className="font-semibold">{likeCount}</span>
                )}
              </button>
              <span className="flex items-center gap-1.5 px-1 text-xs text-[#909090]">
                <MessageCircle className="h-4 w-4" />
                {comments.length}{" "}
                {comments.length === 1 ? "comment" : "comments"}
              </span>
            </div>
          </div>
          {postMenu.length > 0 && <ActionsMenu items={postMenu} />}
        </div>
      </article>

      {/* Thread — exactly two visual levels (Skool-style), enforced
          server-side now (createCommentServerSide's resolveCommentParentId,
          2026-08-19), not merely assumed here. */}
      <div className="space-y-3">
        {topLevel.map((c) => (
          <div key={c.id} className="space-y-2">
            {editingCommentId === c.id ? (
              <CommentComposer
                saId={saId}
                groupId={groupId}
                postId={post.id}
                brand={brand}
                viewer={viewer}
                mode="edit"
                editingComment={c}
                onSaved={(updated) => {
                  setComments((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
                  setEditingCommentId(null);
                }}
                onCancelEdit={() => setEditingCommentId(null)}
              />
            ) : (
              <CommentBubble
                saId={saId}
                pretty={pretty}
                groupSlug={groupSlug}
                comment={c}
                viewer={viewer}
                brand={brand}
                canReply={!currentPost.commentsDisabled}
                onLike={toggleCommentLike}
                onReply={() => startReply(c)}
                onEdit={() => setEditingCommentId(c.id)}
                onDelete={deleteComment}
              />
            )}
            {repliesOf(c.id).map((r) =>
              editingCommentId === r.id ? (
                <CommentComposer
                  key={r.id}
                  saId={saId}
                  groupId={groupId}
                  postId={post.id}
                  brand={brand}
                  viewer={viewer}
                  mode="edit"
                  editingComment={r}
                  onSaved={(updated) => {
                    setComments((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
                    setEditingCommentId(null);
                  }}
                  onCancelEdit={() => setEditingCommentId(null)}
                />
              ) : (
                <CommentBubble
                  key={r.id}
                  saId={saId}
                  pretty={pretty}
                  groupSlug={groupSlug}
                  comment={r}
                  viewer={viewer}
                  brand={brand}
                  indented
                  canReply={!currentPost.commentsDisabled}
                  onLike={toggleCommentLike}
                  onReply={() => startReply(r)}
                  onEdit={() => setEditingCommentId(r.id)}
                  onDelete={deleteComment}
                />
              ),
            )}
          </div>
        ))}
      </div>

      {/* Comment composer (bottom, always reachable) — the author's "Allow
          comments/replies" toggle is enforced server-side (the comments
          POST route 403s regardless), but hiding the form here too is the
          honest UI per the Phase D instruction: a member should never be
          invited to type a comment that's guaranteed to fail. Existing
          comments above remain fully visible either way.

          ONE composer instance handles both a plain top-level comment and
          a targeted reply (replyTarget) — not a second inline reply box
          per comment — so switching which comment you're replying to, or
          cancelling the targeted-reply state, never loses whatever the
          member already typed (see CommentComposer's own module comment). */}
      {currentPost.commentsDisabled ? (
        <p className="rounded-xl border border-[#E4E4E4] bg-[#FAFAFA] px-3 py-2.5 text-center text-xs text-[#909090]">
          Comments are turned off for this post
        </p>
      ) : (
        <CommentComposer
          saId={saId}
          groupId={groupId}
          postId={post.id}
          brand={brand}
          viewer={viewer}
          mode="create"
          collapsedByDefault
          replyTarget={replyTarget}
          onCancelReplyTarget={() => setReplyTarget(null)}
          onCreated={(c) => setComments((prev) => [...prev, c])}
        />
      )}
    </div>
  );
}

function CommentBubble({
  saId,
  pretty = false,
  groupSlug,
  comment,
  viewer,
  brand,
  indented,
  canReply = true,
  onLike,
  onReply,
  onEdit,
  onDelete,
}: {
  saId: string;
  /** True when serving `saId`'s own verified custom domain — see domain.ts. */
  pretty?: boolean;
  groupSlug: string;
  comment: ClientComment;
  viewer: Viewer;
  brand: string;
  indented?: boolean;
  /** Phase D — false when the post's author turned comments/replies off.
   *  Existing comments (this bubble) stay fully visible either way; this
   *  only hides the affordance to add a NEW reply, matching the
   *  server-side 403 the comments route now enforces regardless. */
  canReply?: boolean;
  onLike: (id: string) => void;
  onReply: () => void;
  onEdit: () => void;
  onDelete: (id: string) => void;
}) {
  const isOwn = comment.author.memberId === viewer.memberId;
  const canModerate = viewer.role === "moderator";
  // Author may edit their own comment; moderator may NOT edit someone
  // else's — a moderator can delete another member's content but should
  // never rewrite what they said (explicit product decision, distinct
  // from the broader "moderator can act on any post/comment" delete
  // convention used everywhere else in this codebase). Enforced
  // server-side too (the PATCH route is author-only, full stop) — this
  // is only the UI-affordance side of that same rule.
  const canEditComment = isOwn;
  const canDelete = canModerate || isOwn;
  const menuItems: MenuItem[] = [
    ...(canEditComment ? [{ label: "Edit", onClick: onEdit }] : []),
    ...(canDelete ? [{ label: "Delete", onClick: () => onDelete(comment.id), destructive: true }] : []),
  ];
  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-xl border border-[#E4E4E4] bg-white p-4",
        indented && "ml-8",
      )}
    >
      <MemberAvatar author={comment.author} size={indented ? 28 : 32} brand={brand} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 text-sm">
          <AuthorLink
            saId={saId}
            pretty={pretty}
            viewerMemberId={viewer.memberId}
            author={comment.author}
            brand={brand}
          />
          <span className="text-xs text-[#909090]">
            {timeAgo(comment.createdAtMs)}
            {comment.edited && " · Edited"}
          </span>
          {menuItems.length > 0 && (
            <div className="ml-auto">
              <ActionsMenu items={menuItems} />
            </div>
          )}
        </div>
        <CommunityPostBody
          html={comment.body}
          brand={brand}
          className="mt-0.5"
          saId={saId}
          pretty={pretty}
          groupSlug={groupSlug}
        />
        {comment.attachments && comment.attachments.length > 0 && (
          <CommunityPostAttachments attachments={comment.attachments} brand={brand} className="mt-1.5" />
        )}
        <div className="mt-1.5 flex items-center gap-4 text-xs text-[#909090]">
          <button
            onClick={() => onLike(comment.id)}
            className="flex items-center gap-1 hover:text-[#202124]"
          >
            <ThumbsUp
              className={cn("h-3.5 w-3.5", comment.likedByViewer && "fill-current")}
              style={comment.likedByViewer ? { color: brand } : undefined}
            />
            {comment.likeCount}
          </button>
          {canReply && (
            <button onClick={onReply} className="font-medium hover:text-[#202124]">
              Reply
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
