"use client";

import { useState, type MouseEvent } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { communityHomeHref } from "@/lib/community/routes";
import { communityPostLinkColorStyle, communityPostTypographyClasses } from "./community-post-typography";

/**
 * ONE shared Community post-body renderer — feed cards, post detail, and
 * any future post surface (pinned/featured, etc.) all use this instead of
 * hand-writing their own rendering. `html` MUST already be sanitized
 * server-side (see post-html.ts's `renderCommunityPostHtml`, called at the
 * page level before this ever reaches a client component) — this
 * component trusts what it's given and just renders it; it does not
 * sanitize.
 *
 * Deliberately plain, targeted styling rather than a `prose` typography
 * plugin class — Tailwind Typography's `prose` overrides text color via
 * its own `--tw-prose-*` custom properties (a real gotcha already worked
 * around elsewhere in this codebase for Course theme blocks), and a
 * social post card calls for lighter, more contained styling than an
 * article/CMS treatment anyway.
 *
 * Phase D: `"use client"` (previously a plain server-renderable component)
 * so it can handle clicks on the two structured node types the shared
 * editor's @ mention / # channel-ref extensions can produce inside `html`
 * — event delegation on the wrapper, not per-mention React state, so
 * rendering N mentions costs nothing extra. `saId`/`pretty`/`groupSlug`
 * are optional and only needed to make those two node types interactive;
 * omitting them still renders the post correctly, just without click
 * behavior (defensive, not expected to happen from either real caller).
 */
export function CommunityPostBody({
  html,
  brand,
  clamp,
  className,
  saId,
  pretty = false,
  groupSlug,
}: {
  html: string;
  brand: string;
  /** Feed-card preview clamp — matches the exact 4-line clamp the old
   *  plain-text rendering used. Omit for the full, unclamped post. */
  clamp?: boolean;
  className?: string;
  saId?: string;
  pretty?: boolean;
  groupSlug?: string;
}) {
  const router = useRouter();
  const [mentionCard, setMentionCard] = useState<{
    memberId: string;
    x: number;
    y: number;
    displayName: string;
    bio: string;
    loading: boolean;
  } | null>(null);

  function handleClick(e: MouseEvent<HTMLDivElement>) {
    const target = e.target as HTMLElement;
    const channelEl = target.closest<HTMLElement>('[data-type="channelRef"]');
    if (channelEl && saId && groupSlug) {
      const category = channelEl.getAttribute("data-id");
      if (category) {
        router.push(`${communityHomeHref({ saId, pretty }, groupSlug)}?c=${encodeURIComponent(category)}`);
      }
      return;
    }
    const mentionEl = target.closest<HTMLElement>('[data-type="mention"]');
    if (mentionEl && saId) {
      const memberId = mentionEl.getAttribute("data-id");
      const displayName = mentionEl.getAttribute("data-label") ?? "Member";
      if (!memberId) return;
      const rect = mentionEl.getBoundingClientRect();
      setMentionCard({ memberId, x: rect.left, y: rect.bottom + 4, displayName, bio: "", loading: true });
      fetch(`/api/community/${saId}/member-card/${memberId}`)
        .then((r) => r.json())
        .then((d: { card?: { displayName?: string; bio?: string } }) => {
          setMentionCard((prev) =>
            prev && prev.memberId === memberId
              ? { ...prev, displayName: d.card?.displayName ?? prev.displayName, bio: d.card?.bio ?? "", loading: false }
              : prev,
          );
        })
        .catch(() => setMentionCard((prev) => (prev ? { ...prev, loading: false } : prev)));
    }
  }

  return (
    <>
      <div
        style={communityPostLinkColorStyle(brand)}
        className={cn(
          "text-sm text-[#3a3a44]",
          communityPostTypographyClasses(),
          clamp && "line-clamp-4",
          className,
        )}
        onClick={handleClick}
        dangerouslySetInnerHTML={{ __html: html }}
      />
      {mentionCard && (
        <>
          <button
            className="fixed inset-0 z-40 cursor-default"
            aria-hidden
            onClick={() => setMentionCard(null)}
          />
          <div
            className="fixed z-50 w-56 rounded-xl border border-[#E4E4E4] bg-white p-3 text-left shadow-lg"
            style={{ left: mentionCard.x, top: mentionCard.y }}
          >
            <p className="text-sm font-semibold text-[#202124]">{mentionCard.displayName}</p>
            {mentionCard.loading ? (
              <p className="mt-1 text-xs text-[#909090]">Loading…</p>
            ) : mentionCard.bio ? (
              <p className="mt-1 line-clamp-3 text-xs text-[#3a3a44]">{mentionCard.bio}</p>
            ) : null}
          </div>
        </>
      )}
    </>
  );
}
