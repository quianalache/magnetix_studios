/**
 * Shared typography classes for Community post rich-text HTML — used by
 * BOTH `CommunityPostBody` (published rendering) and `CommunityPostEditor`
 * (the live editing surface), so the two can never drift apart again.
 *
 * Root cause of the "bullets/numbers invisible while composing, correct
 * after publishing" bug this fixes: Tailwind's Preflight reset strips
 * `list-style`/margin/padding from `<ul>`/`<ol>` by default. The renderer
 * already had explicit `list-disc`/`list-decimal` overrides to counteract
 * that; the editor never did — so a bullet/numbered list was always
 * structurally real in the HTML (the toolbar toggle worked correctly),
 * just visually suppressed until it reached the renderer.
 */
export function communityPostTypographyClasses(linkColorVar: string): string {
  return [
    "[&_p]:whitespace-pre-wrap [&_p+p]:mt-2",
    "[&_ul]:my-1 [&_ul]:list-disc [&_ul]:pl-5",
    "[&_ol]:my-1 [&_ol]:list-decimal [&_ol]:pl-5",
    "[&_li]:my-0.5",
    // Nested lists (Tab/Shift+Tab, a StarterKit ListItem default) each get
    // their own list-disc/pl-5 the same way, so indentation compounds
    // naturally per level without extra rules — this just keeps a nested
    // level from rendering unmarked/unindented.
    "[&_li_ul]:list-disc [&_li_ol]:list-decimal",
    "[&_blockquote]:my-1 [&_blockquote]:border-l-2 [&_blockquote]:border-[#E4E4E4] [&_blockquote]:pl-3 [&_blockquote]:text-[#909090]",
    `[&_a]:text-[color:${linkColorVar}] [&_a]:underline [&_a]:underline-offset-2`,
  ].join(" ");
}
