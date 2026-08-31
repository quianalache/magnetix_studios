"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import type { AuthorView } from "@/types/community";
import type { ClientPost } from "./feed-view";
import { PostDetailView, type ClientComment } from "./post-detail-view";

type Props = {
  saId: string;
  groupId: string;
  groupSlug: string;
  brand: string;
  primaryAction?: string;
  accent?: string;
  communityName: string;
  categories: string[];
  pretty?: boolean;
  staffGroupId?: string;
  post: ClientPost;
  viewer: AuthorView & { role: "member" | "moderator" };
  onClose: () => void;
};

/** A contained, reusable focused reading/discussion surface. It keeps the
 * feed mounted behind it and lazily retrieves the exact durable thread used
 * by canonical routes and Community Live chat. */
export function FocusedPostOverlay(props: Props) {
  const [comments, setComments] = useState<ClientComment[] | null>(null);
  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") props.onClose();
    };
    document.addEventListener("keydown", close);
    void fetch(
      `/api/community/${props.saId}/${props.groupId}/posts/${props.post.id}/comments`
    )
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((data: { comments?: ClientComment[] }) =>
        setComments(data.comments ?? [])
      )
      .catch(() => setComments([]));
    return () => document.removeEventListener("keydown", close);
  }, [props]);
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-0 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label="Focused post"
      onMouseDown={props.onClose}
    >
      <section
        className="relative flex h-[100dvh] w-full max-w-3xl flex-col overflow-hidden bg-[var(--community-surface,#fff)] text-[var(--community-text,#202124)] shadow-2xl sm:h-[min(88dvh,900px)] sm:rounded-2xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button
          className="absolute top-3 left-3 z-10 grid h-9 w-9 place-items-center rounded-full border bg-[var(--community-surface,#fff)] shadow-sm hover:bg-black/5"
          onClick={props.onClose}
          aria-label="Close post"
        >
          <X className="h-5 w-5" />
        </button>
        <div className="min-h-0 overflow-y-auto px-4 pt-14 pb-5 sm:px-6">
          {comments === null ? (
            <p className="py-12 text-center text-sm text-[var(--community-text-muted,#777)]">
              Loading discussion…
            </p>
          ) : (
            <PostDetailView {...props} initialComments={comments} />
          )}
        </div>
      </section>
    </div>
  );
}
