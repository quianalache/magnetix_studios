import { cn } from "@/lib/utils";

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
      style={{ ["--post-link-color" as string]: brand }}
      className={cn(
        "text-sm text-[#3a3a44]",
        "[&_p]:whitespace-pre-wrap [&_p+p]:mt-2",
        "[&_ul]:my-1 [&_ul]:list-disc [&_ul]:pl-5",
        "[&_ol]:my-1 [&_ol]:list-decimal [&_ol]:pl-5",
        "[&_li]:my-0.5",
        "[&_blockquote]:my-1 [&_blockquote]:border-l-2 [&_blockquote]:border-[#E4E4E4] [&_blockquote]:pl-3 [&_blockquote]:text-[#909090]",
        "[&_a]:text-[color:var(--post-link-color)] [&_a]:underline [&_a]:underline-offset-2",
        clamp && "line-clamp-4",
        className,
      )}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
