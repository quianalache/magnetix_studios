import type { PageAction } from "@/types/pages-funnels-puck";
import type { CanonicalPageAction, Destination, StoredActionInspection } from "@/types/pages-funnels-action";

const ID = /^[A-Za-z0-9_-]{1,128}$/;

const stringValue = (value: unknown): string => (typeof value === "string" ? value : "");

/**
 * Converts the persisted Puck action vocabulary to the canonical internal
 * action model without changing saved page data. Reserved/unknown values are
 * retained in the inspection result but remain inert.
 */
export function canonicalizeStoredAction(raw: unknown): {
  action: CanonicalPageAction;
  status: StoredActionInspection["status"];
  rawType: string | null;
  raw: unknown;
} {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { action: { type: "none" }, status: raw == null ? "supported" : "invalid", rawType: null, raw };
  }
  const value = raw as Record<string, unknown>;
  const rawType = typeof value.type === "string" ? value.type : null;
  const text = (key: string) => stringValue(value[key]);
  const unsupported = (action: CanonicalPageAction = { type: "none" }) => ({ action, status: "unsupported" as const, rawType, raw });
  const invalid = () => ({ action: { type: "none" } as CanonicalPageAction, status: "invalid" as const, rawType, raw });

  switch (rawType) {
    case "none":
      return { action: { type: "none" }, status: "supported", rawType, raw };
    case "url": {
      const url = text("url");
      return url ? { action: { type: "navigate", destination: { type: "external_url", url }, openInNewTab: value.openInNewTab === true }, status: "supported", rawType, raw } : invalid();
    }
    case "page": {
      const pageId = text("pageId");
      return pageId && ID.test(pageId) ? { action: { type: "navigate", destination: { type: "page", pageId }, openInNewTab: value.openInNewTab === true }, status: "supported", rawType, raw } : invalid();
    }
    case "purchase": {
      const offerId = text("offerId");
      return offerId && ID.test(offerId) ? { action: { type: "navigate", destination: { type: "offer_checkout", offerId } }, status: "supported", rawType, raw } : invalid();
    }
    case "scroll": {
      const elementId = text("targetElementId");
      return elementId && ID.test(elementId) ? { action: { type: "navigate", destination: { type: "section", elementId } }, status: "supported", rawType, raw } : invalid();
    }
    case "call": {
      const phoneNumber = text("phoneNumber");
      return phoneNumber ? { action: { type: "navigate", destination: { type: "call", phoneNumber } }, status: "supported", rawType, raw } : invalid();
    }
    case "sms": {
      const phoneNumber = text("phoneNumber");
      return phoneNumber ? { action: { type: "navigate", destination: { type: "sms", phoneNumber, ...(text("message") ? { message: text("message") } : {}) } }, status: "supported", rawType, raw } : invalid();
    }
    case "email": {
      const emailAddress = text("emailAddress");
      return emailAddress ? { action: { type: "navigate", destination: { type: "email", emailAddress, ...(text("subject") ? { subject: text("subject") } : {}) } }, status: "supported", rawType, raw } : invalid();
    }
    // Manual Popup actions (Wave 2A Slice 5). Executed by `executePageAction`
    // (action/execute.ts), never rendered as links.
    case "open_popup": {
      const popupId = text("popupId");
      return popupId && ID.test(popupId) ? { action: { type: "open_popup", popupId }, status: "supported", rawType, raw } : invalid();
    }
    case "close_popup":
      return { action: { type: "close_popup" }, status: "supported", rawType, raw };
    case "submit_form": {
      const formId = text("formId");
      return formId ? unsupported({ type: "submit_form", formId }) : invalid();
    }
    case "show_hide": {
      const targetElementId = text("targetElementId");
      const mode = value.mode === "show" || value.mode === "hide" || value.mode === "toggle" ? value.mode : null;
      return targetElementId && mode ? unsupported({ type: "show_hide", targetElementId, mode }) : invalid();
    }
    case "next_funnel_step":
      return unsupported({ type: "navigate", destination: { type: "funnel_next_step" } });
    case "selected_funnel_step": {
      const funnelStepId = text("funnelStepId");
      return funnelStepId ? unsupported({ type: "navigate", destination: { type: "funnel_step", funnelStepId } }) : invalid();
    }
    case "download":
    case "accept_upsell":
    case "decline_continue":
      return unsupported();
    default:
      return unsupported();
  }
}
/** Convert the canonical supported subset back to the current persisted shape. */
export function toLegacyPageAction(action: CanonicalPageAction): PageAction {
  if (action.type === "none") return { type: "none" };
  if (action.type !== "navigate") return action as PageAction;
  const d: Destination = action.destination;
  switch (d.type) {
    case "external_url": return { type: "url", url: d.url, ...(action.openInNewTab ? { openInNewTab: true } : {}) };
    case "page": return { type: "page", pageId: d.pageId, ...(action.openInNewTab ? { openInNewTab: true } : {}) };
    case "offer_checkout": return { type: "purchase", offerId: d.offerId };
    case "section": return { type: "scroll", targetElementId: d.elementId };
    case "call": return { type: "call", phoneNumber: d.phoneNumber };
    case "sms": return { type: "sms", phoneNumber: d.phoneNumber, ...(d.message ? { message: d.message } : {}) };
    case "email": return { type: "email", emailAddress: d.emailAddress, ...(d.subject ? { subject: d.subject } : {}) };
    default: return { type: "none" };
  }
}
