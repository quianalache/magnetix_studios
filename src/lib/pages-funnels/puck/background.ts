import type {
  SectionBackgroundConfig,
  GradientDirection,
} from "@/types/pages-funnels-puck";

/** Hero's default background — a real, user-editable gradient. Matches the
 *  visual default this codebase used before Phase 2C (a hardcoded, non-
 *  editable `linear-gradient(120deg, var(--accent) 0%, var(--primary)
 *  100%)` baked into `SectionRender`) so existing Hero inserts don't
 *  suddenly look different — the user can change either color or the
 *  direction the moment they open Background settings. Exported from here
 *  (not defined separately in config.tsx and presets/hero.ts) so the
 *  production registry's Hero component and the `buildHeroSection()`
 *  factory can't drift apart on what "Hero's default background" means. */
export const HERO_DEFAULT_BACKGROUND: SectionBackgroundConfig = {
  type: "gradient",
  gradient: { from: "var(--accent)", to: "var(--primary)", direction: "to-br" },
};

/**
 * ONE pure helper turning a `SectionBackgroundConfig` into the final CSS
 * `background` value — Phase 2C task §4/§6: "Editor canvas and Preview
 * must use the SAME rendering logic for Section backgrounds... create or
 * reuse one pure helper... avoid editor-only style code and preview-only
 * style code that can drift." `SectionRender` (layout.tsx) is itself
 * already the single component both `clientPuckConfig` and
 * `serverPuckConfig` render (config.tsx's shared `createPuckConfig`
 * factory) — this helper is the piece of that shared render function's
 * logic that was, before Phase 2C, a hardcoded gradient string. No
 * separate "editor version" / "preview version" of this function exists
 * anywhere in the codebase.
 */
export function sectionBackgroundStyle(
  background: SectionBackgroundConfig | undefined
): string | undefined {
  if (!background || background.type === "none") return undefined;

  if (background.type === "solid") {
    return background.color || undefined;
  }

  // gradient — degrades gracefully while the user is still filling in
  // colors, rather than showing nothing until both are set: a single color
  // chosen so far previews as a flat fill (real, immediate live feedback —
  // QA requirement "change start color -> canvas updates live" — instead
  // of waiting for a second field before anything visibly changes), then
  // upgrades to a real two-stop gradient once both are present.
  const from = background.gradient?.from;
  const to = background.gradient?.to;
  if (!from && !to) return undefined;
  if (from && !to) return from;
  if (!from && to) return to;
  const direction =
    GRADIENT_DIRECTION_CSS[background.gradient?.direction ?? "to-br"];
  return `linear-gradient(${direction}, ${from}, ${to})`;
}

export const GRADIENT_DIRECTION_CSS: Record<GradientDirection, string> = {
  "to-r": "to right",
  "to-l": "to left",
  "to-t": "to top",
  "to-b": "to bottom",
  "to-tr": "to top right",
  "to-tl": "to top left",
  "to-br": "to bottom right",
  "to-bl": "to bottom left",
};

export const GRADIENT_DIRECTION_OPTIONS: {
  label: string;
  value: GradientDirection;
}[] = [
  { label: "Left → Right", value: "to-r" },
  { label: "Right → Left", value: "to-l" },
  { label: "Bottom → Top", value: "to-t" },
  { label: "Top → Bottom", value: "to-b" },
  { label: "↗ Diagonal", value: "to-tr" },
  { label: "↖ Diagonal", value: "to-tl" },
  { label: "↘ Diagonal", value: "to-br" },
  { label: "↙ Diagonal", value: "to-bl" },
];
