import type { CSSProperties } from "react";

/**
 * Shared typography classes for Community post rich-text HTML — used by
 * BOTH `CommunityPostBody` (published rendering) and `CommunityPostEditor`
 * (the live editing surface), so the two can never drift apart again.
 *
 * Root cause of the original "bullets/numbers invisible while composing,
 * correct after publishing" bug this fixes: Tailwind's Preflight reset
 * strips `list-style`/margin/padding from `<ul>`/`<ol>` by default. The
 * renderer already had explicit `list-disc`/`list-decimal` overrides to
 * counteract that; the editor never did — so a bullet/numbered list was
 * always structurally real in the HTML (the toolbar toggle worked
 * correctly), just visually suppressed until it reached the renderer.
 * Confirmed against the actual production CSS bundle (not just a local
 * build) that every rule below except the link color one — see
 * `communityPostLinkColorStyle` — is present and correctly compiled live.
 */
export function communityPostTypographyClasses(): string {
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
    // A static class referencing a CSS custom PROPERTY (Tailwind v4's
    // `text-(--var)` shorthand), never a runtime color baked directly into
    // the class name — see `communityPostLinkColorStyle` for why.
    "[&_a]:text-(--community-post-link-color) [&_a]:underline [&_a]:underline-offset-2",
  ].join(" ");
}

/**
 * Sets the per-tenant brand color the `[&_a]:text-(--community-post-link-color)`
 * rule above reads. Deliberately NOT a parameter baked into a Tailwind
 * class name: Tailwind's JIT scanner reads source files as literal text —
 * it never executes this module's code — so a template-literal class like
 * `` `[&_a]:text-[color:${color}]` `` can never be resolved into a real
 * class no matter what value a given call site passes. This was a real,
 * silent bug in the Phase C QA correction: confirmed by inspecting the
 * actual deployed production CSS, that exact class never made it into the
 * compiled stylesheet — links kept their default underline but never
 * picked up the intended brand color. A static class name that reads a CSS
 * custom property, with the property's VALUE set here via plain inline
 * style (which Tailwind's build never needs to know about), is the
 * pattern that actually works for a value only known at runtime.
 */
export function communityPostLinkColorStyle(color: string): CSSProperties {
  return { ["--community-post-link-color" as string]: color } as CSSProperties;
}
