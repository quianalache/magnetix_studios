"use client";

import { useState } from "react";
import Link from "next/link";
import { X, ThumbsUp, MessageCircle } from "lucide-react";
import { MemberAvatar } from "@/components/community/member-avatar";
import { CommunityPostBody } from "@/components/community/feed/community-post-body";
import type { ClientPost } from "@/components/community/feed/feed-view";

/**
 * Compact embedded Community Post on a course/lesson page ("Pin to Course
 * Page" — 2026-09-03). References the canonical post — same comments,
 * same reactions, same edits — never a copy. The X here removes ONLY the
 * pin relationship (this course page stops showing it); the post itself,
 * its comments, and any other course-page pins are untouched.
 */
export function CoursePagePinnedPost({
  saId,
  groupId,
  postId,
  pinId,
  post,
  detailHref,
  brand,
  canManage,
  pretty,
  staffGroupId,
  groupSlug,
}: {
  saId: string;
  groupId: string;
  postId: string;
  pinId: string;
  post: Pick<
    ClientPost,
    "title" | "body" | "author" | "likeCount" | "commentCount"
  >;
  detailHref: string;
  brand: string;
  canManage: boolean;
  pretty?: boolean;
  staffGroupId?: string;
  groupSlug?: string;
}) {
  const [removed, setRemoved] = useState(false);
  const [removing, setRemoving] = useState(false);

  if (removed) return null;

  async function remove() {
    setRemoving(true);
    try {
      const r = await fetch(
        `/api/community/${saId}/${groupId}/posts/${postId}/course-pins?pinId=${encodeURIComponent(pinId)}`,
        { method: "DELETE" }
      );
      if (r.ok) setRemoved(true);
    } finally {
      setRemoving(false);
    }
  }

  return (
    <div className="relative rounded-xl border border-[#E4E4E4] bg-white p-4">
      {canManage && (
        <button
          onClick={() => void remove()}
          disabled={removing}
          aria-label="Remove from this course page"
          title="Remove from this course page"
          className="absolute top-3 right-3 rounded-full p-1 text-[#909090] hover:bg-black/5 hover:text-[#202124] disabled:opacity-50"
        >
          <X className="h-4 w-4" />
        </button>
      )}
      <Link
        href={detailHref}
        className="flex min-w-0 items-center gap-2.5 pr-8"
      >
        <MemberAvatar author={post.author} size={32} brand={brand} />
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-[#202124]">
            {post.title}
          </p>
          <p className="truncate text-xs text-[#909090]">
            {post.author.displayName}
          </p>
        </div>
      </Link>
      <Link href={detailHref}>
        <CommunityPostBody
          html={post.body}
          brand={brand}
          clamp
          className="mt-2"
          saId={saId}
          pretty={pretty}
          staffGroupId={staffGroupId}
          groupSlug={groupSlug}
        />
      </Link>
      <Link
        href={detailHref}
        className="mt-3 flex items-center gap-4 text-xs text-[#909090] hover:text-[#202124]"
      >
        <span className="flex items-center gap-1">
          <ThumbsUp className="h-3.5 w-3.5" /> {post.likeCount}
        </span>
        <span className="flex items-center gap-1">
          <MessageCircle className="h-3.5 w-3.5" /> {post.commentCount}
        </span>
      </Link>
    </div>
  );
}
