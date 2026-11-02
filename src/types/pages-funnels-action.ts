/**
 * Canonical Pages & Funnels action vocabulary.
 *
 * The native Puck blocks still accept the legacy `PageAction` shape from
 * pages-funnels-puck.ts for backwards compatibility. `canonicalizeStoredAction`
 * converts that persisted shape to this contract at the action/resolution
 * boundary. New runtime consumers should depend on these types instead of
 * inventing another destination field.
 */

export type ActionContext = "builder" | "preview" | "published";

export type Destination =
  | { type: "external_url"; url: string }
  | { type: "page"; pageId: string }
  | { type: "section"; elementId: string }
  | { type: "funnel_next_step" }
  | { type: "funnel_step"; funnelStepId: string }
  | { type: "offer_checkout"; offerId: string }
  | { type: "booking"; bookingPageSlug: string }
  | { type: "call"; phoneNumber: string }
  | { type: "sms"; phoneNumber: string; message?: string }
  | { type: "email"; emailAddress: string; subject?: string };

export type CanonicalPageAction =
  | { type: "none" }
  | { type: "navigate"; destination: Destination; openInNewTab?: boolean }
  | { type: "open_popup"; popupId: string }
  | { type: "close_popup" }
  | { type: "submit_form"; formId: string }
  | { type: "show_hide"; targetElementId: string; mode: "show" | "hide" | "toggle" };

export type FormSuccessAction =
  | { type: "show_message"; message: string }
  | { type: "navigate"; destination: Destination }
  | { type: "open_popup"; popupId: string };

export type ResolutionFailure =
  | "invalid"
  | "missing"
  | "unpublished"
  | "cross_tenant"
  | "unsupported"
  | "unavailable";

export interface ResolvedDestination {
  href: string;
  newTab: boolean;
  destinationType: Destination["type"];
}
export type DestinationResolution =
  | { status: "resolved"; destination: ResolvedDestination }
  | { status: ResolutionFailure; destinationType: Destination["type"] | null };

export interface StoredActionInspection {
  /** The safe legacy representation used by the current Puck UI. */
  action: import("@/types/pages-funnels-puck").PageAction;
  /** Unsupported and malformed data is preserved in `raw` for diagnostics. */
  status: "supported" | "unsupported" | "invalid";
  rawType: string | null;
  raw: unknown;
}
