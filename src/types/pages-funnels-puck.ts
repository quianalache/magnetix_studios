import type { LeadForm } from "@/types/forms";

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
