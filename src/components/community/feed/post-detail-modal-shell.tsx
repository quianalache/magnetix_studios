"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";

/**
 * Visual chrome for the route-backed post-detail modal (Next.js
 * intercepting routes — see @modal/(.)community/[postId]/page.tsx). The
 * URL genuinely changes to the canonical post URL before this ever mounts
 * (Link/router.push, not window.location), so browser Back, refresh, and a
 * copied/shared link all just work — this component only owns the
 * backdrop/panel presentation and the "X" close affordance.
 *
 * Close is `router.back()`, not a fixed href: it returns to wherever the
 * modal was opened FROM (the feed, a channel filter, search results,
 * anywhere `communityPostHref` gets used), matching the one canonical
 * post-actions model's "Open post" everywhere it appears — never a
 * hardcoded "back to community home".
 */
export function PostDetailModalShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const close = () => router.back();

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-0 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label="Post"
      onMouseDown={close}
    >
      <section
        className="relative flex h-[100dvh] w-full max-w-3xl flex-col overflow-hidden bg-[var(--community-surface,#fff)] text-[var(--community-text,#202124)] shadow-2xl sm:h-[min(88dvh,900px)] sm:rounded-2xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <button
          onClick={close}
          className="absolute top-3 left-3 z-10 grid h-9 w-9 place-items-center rounded-full border bg-[var(--community-surface,#fff)] shadow-sm hover:bg-black/5"
          aria-label="Close post"
        >
          <X className="h-5 w-5" />
        </button>
        <div className="min-h-0 overflow-y-auto px-4 pt-14 pb-5 sm:px-6">
          {children}
        </div>
      </section>
    </div>
  );
}
