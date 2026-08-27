import type { LeadForm } from "@/types/forms";
import type { BlockAlignment } from "@/types/pages-funnels";

/**
 * Pages & Funnels — Puck production foundation, shared prop/action types.
 *
 * PHASE 1 (production Puck foundation alongside the existing V1 builder —
 * see docs/product/pages-funnels-production-spec.md). Nothing in this file
 * is wired into Firestore, the live editor route, or `/p/[pageId]` yet.
 * Reuses V1's `BlockAlignment`/`ButtonStyle`/`BackgroundStyle` and V2's
 * `ColumnWidth`/`SectionMaxWidth` rather than redefining them — one style
 * vocabulary across V1, the V2 reference tree, and Puck, per the master
 * spec's "shared vocabulary" convention (see pages-funnels-v2.ts's own doc
 * comment for the same rule applied one layer down).
 */

export type {
  BlockAlignment as PuckAlignment,
  ButtonStyle as PuckButtonStyle,
  BackgroundStyle as PuckBackgroundStyle,
} from "@/types/pages-funnels";
/** `export type {X as Y} from "..."` re-exports Y for OTHER files but does
 *  NOT bind it locally — this local alias lets the rest of THIS file (the
 *  System A types below) reference `PuckAlignment` too, matching every
 *  other file in this codebase that already imports the same re-export. */
type PuckAlignment = BlockAlignment;
export type {
  ColumnWidth as PuckColumnWidth,
  SectionMaxWidth as PuckSectionMaxWidth,
} from "@/types/pages-funnels-v2";

// ---------- shared Action System foundation (§8/§9 of the master spec) ----------

/**
 * Placeholder foundation for the future Shared Action system (master spec
 * §8, Build Phase 3). Deliberately NOT fully implemented in Phase 1 — only
 * `{ type: "url" }` actually resolves to a working destination
 * (`resolveActionHref` in src/lib/pages-funnels/puck/action.ts). Every other
 * variant is a real, typed, reserved case so Button/Image/etc. never need a
 * breaking schema change when Phase 3 implements the rest — they already
 * accept a `PageAction`, not a raw `href: string`.
 *
 * Each variant's shape is a best-effort forecast of what that action will
 * need once implemented (e.g. `selected_funnel_step` already carries a
 * `funnelStepId`), but the exact fields may still evolve in Phase 3 — what
 * must NOT change is that interactive elements hold a `PageAction`, not a
 * string. Compatibility-by-element/context (Button supports these, Image
 * supports fewer) is intentionally NOT encoded in this type — it lives in
 * whichever field-editing UI Phase 3 builds; this type only defines the
 * vocabulary itself.
 */
export type PageActionType =
  | "none"
  | "url"
  | "next_funnel_step"
  | "selected_funnel_step"
  | "scroll"
  | "open_popup"
  | "close_popup"
  | "show_hide"
  | "submit_form"
  | "download"
  | "call"
  | "sms"
  | "email"
  | "purchase"
  | "accept_upsell"
  | "decline_continue";

export type PageAction =
  | { type: "none" }
  | { type: "url"; url: string; openInNewTab?: boolean }
  /** Resolves at runtime from Magnetix's own funnel ordering (master spec
   *  §12) — Puck/this type never needs to know what a funnel is beyond this
   *  tag. Not resolved until Build Phase 5. */
  | { type: "next_funnel_step" }
  | { type: "selected_funnel_step"; funnelStepId: string }
  | { type: "scroll"; targetElementId: string }
  | { type: "open_popup"; popupId: string }
  | { type: "close_popup" }
  | {
      type: "show_hide";
      targetElementId: string;
      mode: "show" | "hide" | "toggle";
    }
  | { type: "submit_form"; formId: string }
  | { type: "download"; fileUrl: string }
  | { type: "call"; phoneNumber: string }
  | { type: "sms"; phoneNumber: string; message?: string }
  | { type: "email"; emailAddress: string; subject?: string }
  | { type: "purchase"; offerId: string }
  | { type: "accept_upsell" }
  | { type: "decline_continue" };

export const DEFAULT_PAGE_ACTION: PageAction = { type: "none" };

// ---------- Puck metadata contract (§10/§11 — server form resolution) ----------

/**
 * The `metadata` object passed to both `clientPuckConfig`'s `<Puck>` editor
 * and `serverPuckConfig`'s `<Render>`, read inside render functions via
 * `puck.metadata` (proven in the POC). `subAccountId` is the tenant-scoping
 * value every business element (Form now; Booking/Checkout in later
 * phases) needs. `resolvedForms` is populated server-side (Admin SDK, same
 * pattern as `/p/[pageId]`'s `SectionTreeView` caller) before `<Render>`
 * runs, so the server Form renderer never fetches — it only reads what's
 * already here. The client/editor Form renderer does NOT rely on this being
 * populated; it fetches on demand instead (see form-client.tsx).
 */
export interface PuckPageMetadata {
  subAccountId: string;
  resolvedForms?: Record<string, LeadForm | null>;
}

// ---------- Background (Phase 2D — production-grade color/gradient/blur) ----------

/**
 * Production background model — Phase 2D. Replaces Phase 2C's
 * `SectionBackgroundConfig` (`{type: "none"|"solid"|"gradient", color?,
 * gradient?: {from,to,direction}}`), which real user QA found "materially
 * too shallow" against the researched HighLevel capability reference
 * (Phase 2D task §1): only 2 gradient stops, no radial/angular gradient
 * types, no stop add/remove, no blur, and — critically — Row/Column had no
 * background field at all. This shape is deliberately generic (not
 * `SectionBackgroundConfig`) because Phase 2D task §6 requires Section,
 * Row, AND Column to share the exact same model and rendering helper, not
 * three unrelated copies.
 *
 * `source` is the top-level mental model the task asked for (§8: "Color |
 * Image | Video", not the old flat None/Solid/Gradient) — `image`/`video`
 * are typed now (so the shape won't need a breaking rewrite once real
 * media-background editing is built) but have no field UI yet in this
 * phase, per the task's explicit "do not build an elaborate media-
 * management feature in this task."
 */
export type BackgroundSource = "none" | "color" | "image" | "video";
export type ColorMode = "solid" | "gradient";
export type GradientType = "linear" | "radial" | "angular";

/** One color stop in a gradient. `id` is stable per-stop (not derived from
 *  array index) so the gradient editor's add/remove/reorder never confuses
 *  React or loses focus mid-edit — same reasoning V2's `AccordionItem`/
 *  `FeatureItem` etc. already established for array-of-object content in
 *  this codebase. `position` is a 0–100 percentage along the gradient
 *  axis, matching CSS gradient stop syntax directly (`color position%`). */
export interface GradientStop {
  id: string;
  color: string;
  position: number;
}

/** `angle` is only meaningful for `linear` (direction) and `angular`
 *  (rotation of the conic gradient's start) — `radial` gradients don't
 *  have a CSS angle concept, so the field UI hides angle entirely for
 *  that type (§5/§8: "appropriate radial configuration," not a dead
 *  control). Capped at 10 stops (§5) by the field editor, not this type —
 *  the type itself doesn't need to enforce that, matching how Column width
 *  is a closed value set but Row's column *count* isn't type-enforced. */
export interface GradientConfig {
  type: GradientType;
  angle: number;
  stops: GradientStop[];
}

export interface ColorBackgroundConfig {
  mode: ColorMode;
  /** Empty string, not undefined, when unset — keeps the color field editor
   *  a plain controlled input with no `value ?? ""` scattered through it. */
  solid: string;
  gradient: GradientConfig;
}

/** §7: "Implement as backdrop/background blur appropriate to the rendered
 *  container. Ensure child content itself remains crisp." `intensity` is a
 *  blur radius in px — rendered on a dedicated background LAYER (see
 *  `BackgroundLayer`, components/pages-funnels/puck/background-layer.tsx),
 *  never as a `filter` on the container itself, which would blur children
 *  too. */
export interface BackgroundBlurConfig {
  enabled: boolean;
  intensity: number;
}

export interface BackgroundConfig {
  source: BackgroundSource;
  color: ColorBackgroundConfig;
  /** Typed now, no field UI yet — see file doc comment. */
  image?: { url: string };
  video?: { url: string };
  blur: BackgroundBlurConfig;
}

// ---------- Shared Style System (Phase "System A" — launch-scope) ----------

/**
 * The shared cross-component style architecture (master spec §24.3/§24.20:
 * Typography, Spacing, Border, Radius, Shadow, Responsive overrides, Device
 * visibility). One `StyleConfig` type, one `styleField` custom-field family
 * (`components/pages-funnels/puck/style-field.tsx`), one set of pure
 * `resolve*` helpers (`lib/pages-funnels/puck/style.ts`) — consumed
 * identically by every compatible component's render function, exactly the
 * "one shared data model + one shared renderer" pattern Phase 2D already
 * proved for `BackgroundConfig`/`BackgroundLayer`. This is deliberately a
 * SEPARATE prop from each component's existing content/layout fields (e.g.
 * Heading keeps its own `text`/`level`/`alignment`, Section keeps its own
 * `maxWidth`/`paddingTop`/`paddingBottom`) — every `StyleConfig` group is
 * additive and OPTIONAL-shaped (see each sub-type's own doc comment): an
 * unset group resolves to no CSS output at all, so existing/migrated
 * content that has never touched System A renders byte-identically to
 * before this system existed. New capability layers on top via inline
 * style (which always wins over a Tailwind class in the CSS cascade), it
 * never replaces or renames an existing field. This is a deliberate safety
 * choice, not an oversight — removing/renaming `alignment`, `paddingTop`,
 * etc. would be a breaking prop-shape change touching every defaultProps
 * blob, every render signature, and the V1 migration mapping, for a
 * capability that inline-style layering already delivers without any of
 * that risk.
 *
 * `StyleCompatibility` (below) is the literal, inspectable "which shared
 * style groups does this component expose" matrix master spec §24 asks
 * for (§15 of the System A task) — passed once per component registration
 * in `config.tsx` via `createStyleField(compatibility)`, not hardcoded
 * separately per component's field editor.
 */

/** Reuses Magnetix Forms' own curated, web-safe font-stack vocabulary
 *  (`FONT_FAMILY_STACKS`, `src/types/forms.ts`) rather than inventing a
 *  second one — same "shared vocabulary, not redefined" convention this
 *  file's own header establishes for `PuckAlignment`/`PuckButtonStyle`/etc.
 *  No web-font loading (no extra network request, no FOUT) — matches the
 *  System A task's explicit instruction not to introduce a font-loading
 *  system this task; the data model stays extensible for one later.
 *  Derived from `FormAppearance["fontFamily"]` (no standalone exported
 *  alias exists in forms.ts) rather than duplicating the literal union. */
export type FontFamilyKey = NonNullable<
  import("@/types/forms").FormAppearance["fontFamily"]
>;

/**
 * Every field optional — `undefined` means "inherit/unset," not "reset to
 * zero/none." `resolveTypographyStyles` (style.ts) only emits a CSS
 * property for fields actually set, so an empty `{}` config produces no
 * inline style at all and existing Tailwind-class-driven sizing (e.g.
 * Heading's h1/h2/h3 Tailwind size classes) keeps working untouched.
 * `textAlign` reuses `PuckAlignment` (left/center/right) — the same
 * vocabulary the legacy per-element `alignment` field already used, so a
 * user setting Typography's alignment sees the identical option set.
 * Deliberately does NOT include rotation/skew (System A task §4: "not
 * Launch blockers unless trivial and already supported cleanly" — they
 * are not, so out of scope this task).
 */
export interface TypographyConfig {
  fontFamily?: FontFamilyKey;
  fontSize?: number; // px
  fontWeight?: 300 | 400 | 500 | 600 | 700 | 800;
  fontStyle?: "normal" | "italic";
  lineHeight?: number; // unitless multiplier
  letterSpacing?: number; // px
  textAlign?: PuckAlignment;
  color?: string; // hex
  opacity?: number; // 0-100
  textTransform?: "none" | "uppercase" | "lowercase" | "capitalize";
  /** Only meaningful where the element renders a link/icon of its own
   *  (Button, Image-as-link) — harmless/unused elsewhere. */
  linkColor?: string;
  iconColor?: string;
}

/** All four sides optional for the same "unset = no CSS emitted" reason as
 *  `TypographyConfig`. `linked` is UI-only state (whether the editor's four
 *  inputs are currently kept in sync) — resolution never reads it, only
 *  the four numeric values matter for rendering. */
export interface SpacingSides {
  top?: number;
  right?: number;
  bottom?: number;
  left?: number;
}
export interface SpacingConfig {
  margin: SpacingSides;
  marginLinked: boolean;
  padding: SpacingSides;
  paddingLinked: boolean;
}

export type BorderLineStyle = "none" | "solid" | "dashed" | "dotted";
export interface BorderConfig {
  style: BorderLineStyle;
  color: string; // hex, empty string = unset
  width: SpacingSides; // reuses the same four-side shape as Spacing
  widthLinked: boolean;
}

export interface RadiusCorners {
  topLeft?: number;
  topRight?: number;
  bottomRight?: number;
  bottomLeft?: number;
}
export interface RadiusConfig {
  linked: boolean;
  corners: RadiusCorners;
}

/** Launch scope is exactly one box shadow and one text shadow (master spec
 *  §24.3.4) — multiple layered shadows and inset shadow are Very Soon, not
 *  modeled here. `enabled` is stored separately from the numeric fields so
 *  a user can dial in X/Y/blur/spread and then toggle the effect on/off
 *  without losing their values (same pattern `BackgroundBlurConfig`
 *  already established in Phase 2D). */
export interface BoxShadowConfig {
  enabled: boolean;
  x: number;
  y: number;
  blur: number;
  spread: number;
  color: string;
}
export interface TextShadowConfig {
  enabled: boolean;
  x: number;
  y: number;
  blur: number;
  color: string;
}

/**
 * A per-breakpoint STYLE OVERRIDE, not a full duplicate of every style
 * group — System A task §10: "do NOT duplicate entire component props per
 * device." Launch scope covers exactly what the task's own QA checklist
 * exercises: font size, text alignment, and spacing overrides per
 * breakpoint. Resolved to real CSS `@media` rules (`resolveResponsiveCss`,
 * style.ts), not JS viewport-detection — a real site visitor's browser
 * determines the breakpoint, so the SAME rendering path Preview and a
 * future public page both use must express this as actual media-query CSS,
 * not a runtime "which Puck viewport is selected" check (that concept only
 * exists inside the editor).
 */
export interface ResponsiveStyleOverride {
  typography?: Pick<TypographyConfig, "fontSize" | "textAlign">;
  spacing?: Partial<SpacingConfig>;
}
export interface ResponsiveConfig {
  tablet?: ResponsiveStyleOverride;
  mobile?: ResponsiveStyleOverride;
}

/** Defaults to visible everywhere — the one group in this file that is
 *  NOT "unset by default," because an all-false default would silently
 *  hide every existing/migrated component the moment System A shipped. */
export interface DeviceVisibilityConfig {
  desktop: boolean;
  tablet: boolean;
  mobile: boolean;
}

export interface StyleConfig {
  typography: TypographyConfig;
  spacing: SpacingConfig;
  border: BorderConfig;
  radius: RadiusConfig;
  boxShadow: BoxShadowConfig;
  textShadow: TextShadowConfig;
  responsive: ResponsiveConfig;
  visibility: DeviceVisibilityConfig;
}

/**
 * Which `StyleConfig` groups a given component exposes in its Settings
 * field editor (master spec §24's per-component compatibility examples —
 * e.g. Heading gets typography/spacing/textShadow/responsive/visibility
 * but not border/radius/boxShadow; Section gets the reverse). Passed once
 * per component registration in `config.tsx` via
 * `createStyleField(compatibility)` — this object IS the compatibility
 * matrix, in code, not a separate document to keep in sync by hand.
 * Resolution (`style.ts`'s `resolve*` helpers) is UNCONDITIONAL on every
 * group regardless of compatibility — compatibility only gates which
 * controls the EDITOR shows; if a group's data is present, it always
 * renders, so nothing here can silently disagree with what's on screen.
 */
export interface StyleCompatibility {
  typography?: boolean;
  spacing?: boolean;
  border?: boolean;
  radius?: boolean;
  boxShadow?: boolean;
  textShadow?: boolean;
  responsive?: boolean;
  visibility?: boolean;
}
