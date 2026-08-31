"use client";

import { useEffect, useState } from "react";
import type { AuthorView } from "@/types/community";
import type { ClientPost } from "./feed-view";
import { PostDetailView, type ClientComment } from "./post-detail-view";

export function InlineCommentThread(props: {
  saId: string;
  groupId: string;
  groupSlug: string;
  brand: string;
  communityName: string;
  categories: string[];
  pretty?: boolean;
  staffGroupId?: string;
  post: ClientPost;
  viewer: AuthorView & { role: "member" | "moderator" };
}) {
  const [comments, setComments] = useState<ClientComment[] | null>(null);
  useEffect(() => {
    void fetch(
      `/api/community/${props.saId}/${props.groupId}/posts/${props.post.id}/comments`
    )
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data: { comments?: ClientComment[] }) =>
        setComments(data.comments ?? [])
      )
      .catch(() => setComments([]));
  }, [props.groupId, props.post.id, props.saId]);
  return (
    <div className="mt-3 border-t border-[#E4E4E4] pt-3">
      {comments === null ? (
        <p className="text-xs text-[#909090]">Loading comments…</p>
      ) : (
        <PostDetailView {...props} initialComments={comments} commentsOnly />
      )}
    </div>
  );
}
