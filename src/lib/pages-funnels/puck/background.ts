import type {
  BackgroundConfig,
  BackgroundImageSize,
  FocalPoint,
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
    const url = safeBackgroundImageUrl(background.image?.url);
    if (!url) return undefined;
    // No position set = exactly the original output ("center"), so image
    // backgrounds saved before Wave 3 render byte-identically.
    const position = background.image?.position
      ? (({ x, y }) => `${x}% ${y}%`)(clampFocalPoint(background.image.position))
      : "center";
    const size = BACKGROUND_IMAGE_SIZES.includes(background.image?.size as BackgroundImageSize)
      ? background.image!.size!
      : "cover";
    const repeat = background.image?.repeat === true ? "repeat" : "no-repeat";
    return `url("${url}") ${position} / ${size} ${repeat}`;
  }

  // "video" — background video is explicitly out of scope (Wave 3) and no
  // longer offered in the editor; a stored "video" source renders nothing.
  return undefined;
}

export const BACKGROUND_IMAGE_SIZES: readonly BackgroundImageSize[] = ["cover", "contain", "auto"];
export const DEFAULT_FOCAL_POINT: FocalPoint = { x: 50, y: 50 };

/** 0–100 percentages; anything else falls back to centered. */
export function clampFocalPoint(point: FocalPoint | undefined | null): FocalPoint {
  const c = (n: unknown) => (typeof n === "number" && Number.isFinite(n) ? Math.min(100, Math.max(0, Math.round(n))) : 50);
  return { x: c(point?.x), y: c(point?.y) };
}

/**
 * Only an absolute http(s) URL may be written into CSS `url("…")`, with
 * the characters that could break out of the string percent-encoded.
 * Anything else renders no image (safe render).
 */
export function safeBackgroundImageUrl(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw.trim() || raw.length > 2048) return null;
  try {
    const u = new URL(raw.trim());
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    return u.href.replace(/["'()\\\s]/g, (ch) => `%${ch.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0")}`);
  } catch {
    return null;
  }
}

/** The overlay tint to paint over an image background, or null. */
export function backgroundOverlay(
  background: BackgroundConfig | undefined,
  resolveColor: (setting: NonNullable<BackgroundConfig["overlay"]>["color"]) => string | null
): { color: string; opacity: number } | null {
  if (!background || background.source !== "image" || !background.overlay?.enabled) return null;
  if (!safeBackgroundImageUrl(background.image?.url)) return null;
  const opacity = Math.min(100, Math.max(0, Number(background.overlay.opacity) || 0));
  if (opacity === 0) return null;
  const color = resolveColor(background.overlay.color) ?? "#000000";
  return { color, opacity: opacity / 100 };
}

/**
 * Strict save-time check for a background value (Wave 3 image fields).
 * Only the image/overlay parts are new; older shapes pass unchanged.
 */
export function backgroundProblem(raw: unknown): string | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const bg = raw as Partial<BackgroundConfig>;
  const image = bg.image as Partial<NonNullable<BackgroundConfig["image"]>> | undefined;
  if (image !== undefined && image !== null) {
    if (typeof image !== "object") return "A background image couldn't be read.";
    if (image.url !== undefined && typeof image.url !== "string") return "A background image couldn't be read.";
    if (image.url && !safeBackgroundImageUrl(image.url)) return "A background image must be a public https image.";
    if (image.size !== undefined && !BACKGROUND_IMAGE_SIZES.includes(image.size as BackgroundImageSize)) return "A background image size isn't supported.";
    if (image.repeat !== undefined && typeof image.repeat !== "boolean") return "A background image couldn't be read.";
    if (image.position !== undefined) {
      const p = image.position as Partial<FocalPoint>;
      const ok = (n: unknown) => typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 100;
      if (!p || typeof p !== "object" || !ok(p.x) || !ok(p.y)) return "A background image position must be between 0% and 100%.";
    }
  }
  const overlay = bg.overlay as Partial<NonNullable<BackgroundConfig["overlay"]>> | undefined;
  if (overlay !== undefined && overlay !== null) {
    if (typeof overlay !== "object" || (overlay.enabled !== undefined && typeof overlay.enabled !== "boolean")) return "A background overlay couldn't be read.";
    if (overlay.opacity !== undefined && (typeof overlay.opacity !== "number" || overlay.opacity < 0 || overlay.opacity > 100)) return "Overlay opacity must be between 0% and 100%.";
    const c = overlay.color as { source?: unknown; custom?: unknown } | undefined;
    if (c !== undefined && (typeof c !== "object" || !["default", "brand", "custom"].includes(String(c?.source)))) return "A background overlay color couldn't be read.";
    if (c?.source === "custom" && (typeof c.custom !== "string" || !/^#[0-9a-fA-F]{6}$/.test(c.custom))) return "Overlay color must be a hex color.";
  }
  return null;
}

/** Walks a Puck tree (any depth) and checks every background value. */
export function findBackgroundProblem(data: unknown): string | null {
  const seen = new Set<object>();
  let problem: string | null = null;
  const visit = (value: unknown, key: string | null) => {
    if (problem || !value || typeof value !== "object" || seen.has(value)) return;
    seen.add(value);
    if (Array.isArray(value)) return value.forEach((v) => visit(v, null));
    if (key === "background" || key === "pageBackground") {
      const p = backgroundProblem(value);
      if (p) {
        problem = p;
        return;
      }
    }
    for (const [k, v] of Object.entries(value)) visit(v, k);
  };
  visit(data, null);
  return problem;
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
  const stopsCss = sorted
    .map((s) => `${canonicalStopColor(s.color)} ${s.position}%`)
    .join(", ");

  // A single stop can't form a real gradient — preview it as a flat fill
  // rather than emitting invalid/pointless gradient CSS (same "graceful
  // partial feedback while editing" principle Phase 2C established for a
  // single-color gradient-in-progress).
  if (sorted.length === 1) return canonicalStopColor(sorted[0].color);

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

/** The ONE canonical Hero default gradient (lavender → deep plum) — the
 *  look the builder has always shown. Concrete colors, not theme variables:
 *  Hero used to store `var(--accent)` / `var(--primary)`, which resolve to
 *  the Magnetix palette inside the CRM (builder, Preview) but to the plain
 *  near-white / near-black shadcn defaults on the public page, so the same
 *  Hero looked different to visitors. */
export const HERO_DEFAULT_GRADIENT_COLORS = {
  start: "#F6F1FF",
  end: "#3D1652",
} as const;

/** Legacy Hero stops still stored on existing pages (the old untouched
 *  default). They render as the canonical colors everywhere, with no data
 *  rewrite; on a public page these strings never meant anything else. */
const LEGACY_THEME_STOP_COLORS: Record<string, string> = {
  "var(--accent)": HERO_DEFAULT_GRADIENT_COLORS.start,
  "var(--primary)": HERO_DEFAULT_GRADIENT_COLORS.end,
};

/** A gradient stop's color as rendered and as shown in the editor. */
export function canonicalStopColor(color: string): string {
  if (typeof color !== "string") return color;
  return LEGACY_THEME_STOP_COLORS[color.trim()] ?? color;
}

/** Hero's default background — a real, user-editable gradient. Exported
 *  from here (not defined separately in config.tsx and presets/hero.ts) so
 *  the production registry's Hero component and the `buildHeroSection()`
 *  factory can't drift apart on what "Hero's default background" means. */
export const HERO_DEFAULT_BACKGROUND: BackgroundConfig = {
  source: "color",
  color: {
    mode: "gradient",
    solid: "",
    gradient: {
      type: "linear",
      angle: 135,
      stops: [
        stop(HERO_DEFAULT_GRADIENT_COLORS.start, 0),
        stop(HERO_DEFAULT_GRADIENT_COLORS.end, 100),
      ],
    },
  },
  blur: { enabled: false, intensity: 0 },
};
