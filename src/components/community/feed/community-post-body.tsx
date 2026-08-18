import { cn } from "@/lib/utils";
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
 */
export function CommunityPostBody({
  html,
  brand,
  clamp,
  className,
}: {
  html: string;
  brand: string;
  /** Feed-card preview clamp — matches the exact 4-line clamp the old
   *  plain-text rendering used. Omit for the full, unclamped post. */
  clamp?: boolean;
  className?: string;
}) {
  return (
    <div
      style={communityPostLinkColorStyle(brand)}
      className={cn(
        "text-sm text-[#3a3a44]",
        communityPostTypographyClasses(),
        clamp && "line-clamp-4",
        className,
      )}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
