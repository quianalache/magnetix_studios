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

// ---------- Section background (Phase 2C — real, editable gradient/solid controls) ----------

/**
 * Structured Section/Hero background configuration. Replaces the earlier
 * `background: "none" | "solid" | "gradient"` enum-only field (still V1's
 * own shape too — `BackgroundStyle`, `src/types/pages-funnels.ts` — neither
 * V1 nor the pre-Phase-2C Puck Section ever stored real color/direction
 * data; "gradient" only ever selected one hardcoded, non-editable CSS
 * gradient). This is a genuinely stronger shape, not a reuse of an
 * existing one — the task that introduced it explicitly allowed that
 * ("do not blindly use [the suggested shape] if current production types
 * already define something stronger," and nothing stronger existed).
 *
 * `color`/`gradient` are optional so a `type: "solid"` node with no color
 * chosen yet, or a migrated node with no source color data, still
 * type-checks and renders a sensible fallback (see
 * `sectionBackgroundStyle()`, lib/pages-funnels/puck/background.ts) rather
 * than requiring invented values.
 */
export type SectionBackgroundType = "none" | "solid" | "gradient";

/** Named CSS `linear-gradient()` direction keywords — a closed, structured
 *  set (matching the master spec's "constrained fraction presets, not
 *  arbitrary input" convention already used for Column width) rather than
 *  a free-form angle number, per this feature's own instruction: "direction
 *  / angle" — either satisfies it; named keywords are simpler to present as
 *  a `select` field than a numeric angle input. */
export type GradientDirection =
  | "to-r"
  | "to-l"
  | "to-t"
  | "to-b"
  | "to-tr"
  | "to-tl"
  | "to-br"
  | "to-bl";

export interface SectionBackgroundConfig {
  type: SectionBackgroundType;
  /** Hex (or any valid CSS color string) — only meaningful when `type === "solid"`. */
  color?: string;
  /** Only meaningful when `type === "gradient"`. */
  gradient?: {
    from: string;
    to: string;
    direction: GradientDirection;
  };
}

export const DEFAULT_SECTION_BACKGROUND: SectionBackgroundConfig = {
  type: "none",
};
