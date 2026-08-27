import type { CSSProperties } from "react";
import type {
  StyleConfig,
  TypographyConfig,
  SpacingConfig,
  SpacingSides,
  BorderConfig,
  RadiusConfig,
  BoxShadowConfig,
  TextShadowConfig,
  ResponsiveConfig,
  DeviceVisibilityConfig,
  FontFamilyKey,
} from "@/types/pages-funnels-puck";
import { FONT_FAMILY_STACKS } from "@/types/forms";

/**
 * Pure, shared style-resolution helpers for System A (master spec §24.3/
 * §24.20) — the ONE place `StyleConfig` (any group of it) turns into real
 * CSS, consumed identically by every compatible render function in
 * layout.tsx/elements.tsx/form-client.tsx/form-server.tsx, and therefore by
 * both `clientPuckConfig` (editor canvas) and `serverPuckConfig` (Preview,
 * eventually the public page) — exact continuation of the pattern Phase 2D
 * established for `backgroundCssValue`/`BackgroundLayer`.
 *
 * SAFETY / ADDITIVITY RULE (see `StyleConfig`'s own doc comment in
 * types/pages-funnels-puck.ts for the full reasoning): every resolver here
 * only emits a CSS property when the corresponding config field is
 * actually set. An empty/default `StyleConfig` therefore resolves to an
 * empty `{}` style object — it can never silently change how existing or
 * migrated content looks. New capability is additive inline style layered
 * on top of each element's existing Tailwind classes, never a replacement
 * for them.
 */

// ---------- defaults ----------

const EMPTY_SIDES: SpacingSides = {};

export const DEFAULT_TYPOGRAPHY: TypographyConfig = {};

export const DEFAULT_SPACING: SpacingConfig = {
  margin: EMPTY_SIDES,
  marginLinked: true,
  padding: EMPTY_SIDES,
  paddingLinked: true,
};

export const DEFAULT_BORDER: BorderConfig = {
  style: "none",
  color: "",
  width: EMPTY_SIDES,
  widthLinked: true,
};

export const DEFAULT_RADIUS: RadiusConfig = {
  linked: true,
  corners: {},
};

export const DEFAULT_BOX_SHADOW: BoxShadowConfig = {
  enabled: false,
  x: 0,
  y: 4,
  blur: 12,
  spread: 0,
  color: "#00000026",
};

export const DEFAULT_TEXT_SHADOW: TextShadowConfig = {
  enabled: false,
  x: 0,
  y: 1,
  blur: 2,
  color: "#00000040",
};

export const DEFAULT_RESPONSIVE: ResponsiveConfig = {};

/** Visible everywhere — see `DeviceVisibilityConfig`'s own doc comment for
 *  why this is the one group that defaults to "on" rather than "unset." */
export const DEFAULT_VISIBILITY: DeviceVisibilityConfig = {
  desktop: true,
  tablet: true,
  mobile: true,
};

export const DEFAULT_STYLE_CONFIG: StyleConfig = {
  typography: DEFAULT_TYPOGRAPHY,
  spacing: DEFAULT_SPACING,
  border: DEFAULT_BORDER,
  radius: DEFAULT_RADIUS,
  boxShadow: DEFAULT_BOX_SHADOW,
  textShadow: DEFAULT_TEXT_SHADOW,
  responsive: DEFAULT_RESPONSIVE,
  visibility: DEFAULT_VISIBILITY,
};

// ---------- breakpoints ----------

/**
 * Matches `VIEWPORTS` (constants.ts) exactly — Tablet=768, Desktop=1280 —
 * so "hidden on tablet in the editor's device switcher" and "hidden on
 * tablet in a real browser" can never disagree. `TABLET_MAX`/`MOBILE_MAX`
 * are one px below the next breakpoint up, for `max-width` media queries.
 */
export const RESPONSIVE_BREAKPOINTS = {
  desktopMin: 1280,
  tabletMin: 768,
  tabletMax: 1279,
  mobileMax: 767,
} as const;

// ---------- typography ----------

export function resolveTypographyStyles(
  typography: TypographyConfig | undefined
): CSSProperties {
  if (!typography) return {};
  const style: CSSProperties = {};
  if (typography.fontFamily) {
    style.fontFamily =
      FONT_FAMILY_STACKS[typography.fontFamily as FontFamilyKey];
  }
  if (typography.fontSize != null) style.fontSize = `${typography.fontSize}px`;
  if (typography.fontWeight != null) style.fontWeight = typography.fontWeight;
  if (typography.fontStyle) style.fontStyle = typography.fontStyle;
  if (typography.lineHeight != null) style.lineHeight = typography.lineHeight;
  if (typography.letterSpacing != null)
    style.letterSpacing = `${typography.letterSpacing}px`;
  if (typography.textAlign) style.textAlign = typography.textAlign;
  if (typography.color) style.color = typography.color;
  if (typography.opacity != null) style.opacity = typography.opacity / 100;
  if (typography.textTransform) style.textTransform = typography.textTransform;
  return style;
}

// ---------- spacing ----------

function marginSidesToStyle(sides: SpacingSides | undefined): CSSProperties {
  if (!sides) return {};
  const style: CSSProperties = {};
  if (sides.top != null) style.marginTop = `${sides.top}px`;
  if (sides.right != null) style.marginRight = `${sides.right}px`;
  if (sides.bottom != null) style.marginBottom = `${sides.bottom}px`;
  if (sides.left != null) style.marginLeft = `${sides.left}px`;
  return style;
}

function paddingSidesToStyle(sides: SpacingSides | undefined): CSSProperties {
  if (!sides) return {};
  const style: CSSProperties = {};
  if (sides.top != null) style.paddingTop = `${sides.top}px`;
  if (sides.right != null) style.paddingRight = `${sides.right}px`;
  if (sides.bottom != null) style.paddingBottom = `${sides.bottom}px`;
  if (sides.left != null) style.paddingLeft = `${sides.left}px`;
  return style;
}

export function resolveSpacingStyles(
  spacing: Partial<SpacingConfig> | undefined
): CSSProperties {
  if (!spacing) return {};
  return {
    ...marginSidesToStyle(spacing.margin),
    ...paddingSidesToStyle(spacing.padding),
  };
}

// ---------- border ----------

export function resolveBorderStyles(
  border: BorderConfig | undefined
): CSSProperties {
  if (!border || border.style === "none") return {};
  const style: CSSProperties = { borderStyle: border.style };
  if (border.color) style.borderColor = border.color;
  const w = border.width ?? {};
  if (w.top != null) style.borderTopWidth = `${w.top}px`;
  if (w.right != null) style.borderRightWidth = `${w.right}px`;
  if (w.bottom != null) style.borderBottomWidth = `${w.bottom}px`;
  if (w.left != null) style.borderLeftWidth = `${w.left}px`;
  return style;
}

// ---------- radius ----------

export function resolveRadiusStyles(
  radius: RadiusConfig | undefined
): CSSProperties {
  if (!radius) return {};
  const c = radius.corners ?? {};
  const style: CSSProperties = {};
  if (c.topLeft != null) style.borderTopLeftRadius = `${c.topLeft}px`;
  if (c.topRight != null) style.borderTopRightRadius = `${c.topRight}px`;
  if (c.bottomRight != null)
    style.borderBottomRightRadius = `${c.bottomRight}px`;
  if (c.bottomLeft != null) style.borderBottomLeftRadius = `${c.bottomLeft}px`;
  return style;
}

// ---------- shadow ----------

export function resolveBoxShadowStyle(
  shadow: BoxShadowConfig | undefined
): CSSProperties {
  if (!shadow?.enabled) return {};
  return {
    boxShadow: `${shadow.x}px ${shadow.y}px ${shadow.blur}px ${shadow.spread}px ${shadow.color}`,
  };
}

export function resolveTextShadowStyle(
  shadow: TextShadowConfig | undefined
): CSSProperties {
  if (!shadow?.enabled) return {};
  return {
    textShadow: `${shadow.x}px ${shadow.y}px ${shadow.blur}px ${shadow.color}`,
  };
}

// ---------- combined base style ----------

/**
 * Merges every non-responsive, non-visibility group into one inline
 * `style` object — the base/desktop-default appearance. Responsive
 * overrides and per-device visibility are NOT part of this (see
 * `resolveResponsiveCss` below) because they can't be expressed as a
 * flat inline style: a real visitor's browser, not this render call,
 * decides which breakpoint is active.
 */
export function resolveBaseStyleProps(
  style: StyleConfig | undefined
): CSSProperties {
  if (!style) return {};
  return {
    ...resolveTypographyStyles(style.typography),
    ...resolveSpacingStyles(style.spacing),
    ...resolveBorderStyles(style.border),
    ...resolveRadiusStyles(style.radius),
    ...resolveBoxShadowStyle(style.boxShadow),
    ...resolveTextShadowStyle(style.textShadow),
  };
}

// ---------- responsive + visibility CSS ----------

/** Only a `blk_...`/`blk_..._..__suffix`-shaped id (see ids.ts) is ever
 *  used as a literal CSS id selector — this guards against emitting
 *  invalid/unsafe CSS if an id ever contains an unexpected character,
 *  rather than assuming the format. */
const SAFE_CSS_ID = /^[a-zA-Z_][\w-]*$/;

function cssDeclarations(style: CSSProperties): string {
  return Object.entries(style)
    .map(([prop, value]) => {
      if (value == null) return "";
      const cssProp = prop.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`);
      return `${cssProp}:${value};`;
    })
    .join("");
}

/**
 * The ONE shared responsive/visibility resolver (System A task §10: "use
 * one shared resolver/helper... do not write custom breakpoint logic
 * separately inside every renderer"). Returns a raw CSS string — real
 * `@media` rules scoped to this component instance's own stable `id` — to
 * be rendered inside a plain `<style>` tag alongside the component's base
 * inline style. Returns `null` when there is nothing to emit (no
 * responsive overrides set AND visible on every device), so components
 * that never touch System A's responsive/visibility controls render zero
 * extra DOM, matching this file's additivity rule.
 *
 * Style OVERRIDES cascade base -> tablet -> mobile (overlapping
 * `max-width` ranges, tablet's block written before mobile's, so a narrow
 * viewport picks up mobile's more specific declarations last and wins —
 * ordinary CSS source-order cascade, no specificity tricks needed).
 * VISIBILITY uses mutually exclusive `min-width`/`max-width` RANGES
 * instead (not a cascade) — showing/hiding per device is an independent
 * toggle per breakpoint, not something that should "inherit" from the
 * next breakpoint up the way a font-size override naturally would.
 */
export function resolveResponsiveCss(
  id: string,
  style: StyleConfig | undefined
): string | null {
  if (!style || !SAFE_CSS_ID.test(id)) return null;

  const { tabletMax, mobileMax, tabletMin, desktopMin } =
    RESPONSIVE_BREAKPOINTS;
  const selector = `#${id}`;
  let css = "";

  const tabletOverride = style.responsive?.tablet;
  if (tabletOverride) {
    const decl = cssDeclarations({
      ...resolveTypographyStyles(tabletOverride.typography),
      ...resolveSpacingStyles(tabletOverride.spacing),
    });
    if (decl) css += `@media (max-width:${tabletMax}px){${selector}{${decl}}}`;
  }

  const mobileOverride = style.responsive?.mobile;
  if (mobileOverride) {
    const decl = cssDeclarations({
      ...resolveTypographyStyles(mobileOverride.typography),
      ...resolveSpacingStyles(mobileOverride.spacing),
    });
    if (decl) css += `@media (max-width:${mobileMax}px){${selector}{${decl}}}`;
  }

  const visibility = style.visibility ?? DEFAULT_VISIBILITY;
  if (!visibility.desktop) {
    css += `@media (min-width:${desktopMin}px){${selector}{display:none;}}`;
  }
  if (!visibility.tablet) {
    css += `@media (min-width:${tabletMin}px) and (max-width:${tabletMax}px){${selector}{display:none;}}`;
  }
  if (!visibility.mobile) {
    css += `@media (max-width:${mobileMax}px){${selector}{display:none;}}`;
  }

  return css || null;
}
