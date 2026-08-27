import type {
  BackgroundConfig,
  GradientConfig,
  GradientType,
} from "@/types/pages-funnels-puck";
import { newPuckNodeId } from "@/lib/pages-funnels/puck/ids";

/**
 * Production background model — Phase 2D. ONE pure helper turning a
 * `BackgroundConfig` into the final CSS `background` value, shared by
 * Section, Row, and Column (master spec §6/§13, Phase 2D task §3/§6:
 * "create or reuse one pure helper... use the same shared data model and
 * renderer helper... do not implement three unrelated copies"). Consumed
 * by `BackgroundLayer` (components/pages-funnels/puck/background-layer.tsx)
 * — the one shared presentational component all three layout primitives
 * render — so editor canvas and Preview can never drift: both render the
 * exact same `SectionRender`/`RowRender`/`ColumnRender`, which both render
 * this exact same helper's output.
 */
export function backgroundCssValue(
  background: BackgroundConfig | undefined
): string | undefined {
  if (!background || background.source === "none") return undefined;

  if (background.source === "color") {
    if (background.color.mode === "solid") {
      return background.color.solid || undefined;
    }
    return gradientCssValue(background.color.gradient);
  }

  if (background.source === "image") {
    return background.image?.url
      ? `url("${background.image.url}") center / cover no-repeat`
      : undefined;
  }

  // "video" has no CSS `background` equivalent — a real video background
  // needs an actual <video> element layered behind content, not a style
  // string. Not built this phase (§8: "Image/Video background editing
  // remains limited in this task") — returning undefined here is honest,
  // not a bug: there is nothing to preview until that element exists.
  return undefined;
}

/**
 * Renders a `GradientConfig` to a CSS gradient function string. Stops are
 * sorted by `position` before rendering — the field editor doesn't require
 * the user to add stops in left-to-right order, so this is the one place
 * that guarantees valid, monotonically-ordered CSS output regardless of
 * how stops were authored or reordered.
 */
export function gradientCssValue(
  gradient: GradientConfig | undefined
): string | undefined {
  if (!gradient || gradient.stops.length === 0) return undefined;

  const sorted = [...gradient.stops].sort((a, b) => a.position - b.position);
  const stopsCss = sorted.map((s) => `${s.color} ${s.position}%`).join(", ");

  // A single stop can't form a real gradient — preview it as a flat fill
  // rather than emitting invalid/pointless gradient CSS (same "graceful
  // partial feedback while editing" principle Phase 2C established for a
  // single-color gradient-in-progress).
  if (sorted.length === 1) return sorted[0].color;

  switch (gradient.type) {
    case "linear":
      return `linear-gradient(${gradient.angle}deg, ${stopsCss})`;
    case "radial":
      // No CSS angle concept for radial — deliberately ignores `angle`,
      // per this type's own doc comment.
      return `radial-gradient(circle, ${stopsCss})`;
    case "angular":
      return `conic-gradient(from ${gradient.angle}deg, ${stopsCss})`;
  }
}

export const GRADIENT_TYPE_OPTIONS: { label: string; value: GradientType }[] = [
  { label: "Linear", value: "linear" },
  { label: "Radial", value: "radial" },
  { label: "Angular", value: "angular" },
];

export const MAX_GRADIENT_STOPS = 10;
export const MIN_GRADIENT_STOPS = 2;

function stop(color: string, position: number) {
  return { id: newPuckNodeId(), color, position };
}

/** Sensible starting point the moment a user switches Color mode to
 *  Gradient for the first time on a Section/Row/Column that had no prior
 *  gradient configured — not "invented historic data" (nothing is being
 *  migrated here), just an editable, non-empty starting point, matching
 *  how e.g. Row's own `defaultProps.columns` already seeds two empty
 *  Columns rather than an unusable empty array. */
export const DEFAULT_GRADIENT: GradientConfig = {
  type: "linear",
  angle: 135,
  stops: [stop("#5E2574", 0), stop("#E8B7C8", 100)],
};

export const DEFAULT_BACKGROUND: BackgroundConfig = {
  source: "none",
  color: { mode: "solid", solid: "", gradient: DEFAULT_GRADIENT },
  blur: { enabled: false, intensity: 0 },
};

/** Hero's default background — a real, user-editable gradient. Matches the
 *  visual default this codebase used before Phase 2C/2D (originally a
 *  hardcoded, non-editable `linear-gradient(120deg, var(--accent) 0%,
 *  var(--primary) 100%)` baked into `SectionRender`) so existing Hero
 *  inserts don't suddenly look different — the user can change any of it
 *  the moment they open Background settings. Exported from here (not
 *  defined separately in config.tsx and presets/hero.ts) so the production
 *  registry's Hero component and the `buildHeroSection()` factory can't
 *  drift apart on what "Hero's default background" means. */
export const HERO_DEFAULT_BACKGROUND: BackgroundConfig = {
  source: "color",
  color: {
    mode: "gradient",
    solid: "",
    gradient: {
      type: "linear",
      angle: 135,
      stops: [stop("var(--accent)", 0), stop("var(--primary)", 100)],
    },
  },
  blur: { enabled: false, intensity: 0 },
};
