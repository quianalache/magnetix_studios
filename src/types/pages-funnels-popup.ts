import type { Data as PuckData } from "@puckeditor/core";
import { PUCK_JSON_ENCODING, isPuckData, parsePuckJson } from "@/lib/pages-funnels/puck-storage";

/**
 * How a Popup opens on its own (Slice 6). Manual = only an explicit Open
 * Popup action; Delay = after `delaySeconds` of the page being open;
 * Exit intent = desktop pointer leaving through the top of the window.
 * At most one automatic Popup per page view (see `popup-triggers.ts`), so
 * there is no per-Popup frequency setting.
 */
export type PopupTrigger =
  | { type: "manual" }
  | { type: "delay"; delaySeconds: number }
  | { type: "exit_intent" };

export const POPUP_DELAY_MIN_SECONDS = 1;
export const POPUP_DELAY_MAX_SECONDS = 3600;
export const POPUP_DELAY_DEFAULT_SECONDS = 10;

const isDelaySeconds = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value) && value >= POPUP_DELAY_MIN_SECONDS && value <= POPUP_DELAY_MAX_SECONDS;

/**
 * Strict read for the SAVE boundary. A missing trigger is a legacy Manual
 * Popup; anything else that isn't a valid trigger is an error the owner
 * sees. (Slice 3–5 docs may carry an `oncePerPageView` flag — ignored.)
 */
export function parsePopupTrigger(raw: unknown): { ok: true; trigger: PopupTrigger } | { ok: false; error: string } {
  if (raw === undefined || raw === null) return { ok: true, trigger: { type: "manual" } };
  const type = raw && typeof raw === "object" ? (raw as { type?: unknown }).type : undefined;
  if (type === "manual") return { ok: true, trigger: { type: "manual" } };
  if (type === "exit_intent") return { ok: true, trigger: { type: "exit_intent" } };
  if (type === "delay") {
    const seconds = (raw as { delaySeconds?: unknown }).delaySeconds;
    return isDelaySeconds(seconds)
      ? { ok: true, trigger: { type: "delay", delaySeconds: seconds } }
      : { ok: false, error: `Delay must be a whole number of seconds from ${POPUP_DELAY_MIN_SECONDS} to ${POPUP_DELAY_MAX_SECONDS}.` };
  }
  return { ok: false, error: "This trigger type isn't supported." };
}

/** Lenient read for RENDERING: anything unreadable becomes Manual, so a bad doc never auto-opens or crashes. */
export function normalizePopupTrigger(raw: unknown): PopupTrigger {
  const parsed = parsePopupTrigger(raw);
  return parsed.ok ? parsed.trigger : { type: "manual" };
}

/** Owner-facing summary: "Manual", "Delay · 10s", "Exit intent". */
export function popupTriggerSummary(trigger: PopupTrigger): string {
  if (trigger.type === "delay") return `Delay · ${trigger.delaySeconds}s`;
  if (trigger.type === "exit_intent") return "Exit intent";
  return "Manual";
}

/**
 * Creation order — the ONE ordering for the manager, the Open popup picker
 * and automatic-trigger tie-breaks. `createdAt` (ISO, stamped on create)
 * ascending; a legacy Popup without one sorts first (it predates
 * timestamps); the stable Popup id breaks any remaining tie.
 */
export function comparePopupCreationOrder(a: { id: string; createdAt?: string }, b: { id: string; createdAt?: string }): number {
  return (a.createdAt ?? "").localeCompare(b.createdAt ?? "") || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

export interface PopupStyle {
  overlayColor: string;
  overlayOpacity: number;
  blurPx: number;
  panelMaxWidth: number;
  panelWidth: string;
  panelBackground: string;
  panelBorder: string;
  panelShadow: string;
  panelBorderRadius: number;
  panelPadding: number;
  panelAlignment: "left" | "center" | "right";
  panelPlacement: "center" | "top" | "bottom";
  closePlacement: "inside" | "outside";
  closeOnOverlayClick: boolean;
}

export interface PopupDefinition {
  id: string;
  name: string;
  content: PuckData;
  trigger: PopupTrigger;
  style: PopupStyle;
  createdAt?: string;
  updatedAt?: string;
}

export type PopupDefinitionMap = Record<string, PopupDefinition>;

export const DEFAULT_POPUP_STYLE: PopupStyle = {
  overlayColor: "#160b2f",
  overlayOpacity: 0.58,
  blurPx: 0,
  panelMaxWidth: 640,
  panelWidth: "min(640px, calc(100vw - 32px))",
  panelBackground: "#ffffff",
  panelBorder: "1px solid rgba(22, 11, 47, 0.12)",
  panelShadow: "0 24px 80px rgba(22, 11, 47, 0.22)",
  panelBorderRadius: 20,
  panelPadding: 32,
  panelAlignment: "center",
  panelPlacement: "center",
  closePlacement: "inside",
  closeOnOverlayClick: true,
};

/**
 * A new Popup's starting content (Slice 4.5): Section → Row → Column →
 * Heading, Text, Button with generic placeholder copy only. Puck fills every
 * other prop from each block's own defaultProps when the editor loads it.
 */
export function createDefaultPopup(id: string, name = "Untitled popup"): PopupDefinition {
  const sectionId = `${id}-section`;
  const rowId = `${id}-row`;
  const columnId = `${id}-column`;
  return {
    id,
    name,
    content: {
      root: { props: {} },
      content: [
        {
          type: "Section",
          props: {
            id: sectionId,
            rows: [{
              type: "Row",
              props: {
                id: rowId,
                columns: [{
                  type: "Column",
                  props: {
                    id: columnId,
                    width: "full",
                    alignment: "left",
                    elements: [
                      { type: "Heading", props: { id: `${id}-heading`, text: "Add your headline", level: "h2", alignment: "left" } },
                      { type: "Text", props: { id: `${id}-text`, text: "Add a short message for your visitors.", alignment: "left" } },
                      { type: "Button", props: { id: `${id}-button`, text: "Button", action: { type: "none" }, style: "primary", alignment: "left" } },
                    ],
                  },
                }],
              },
            }],
          },
        },
      ],
    } as PuckData,
    trigger: { type: "manual" },
    style: { ...DEFAULT_POPUP_STYLE },
  };
}

/**
 * How a Popup is STORED on the page doc (`puckDraftPopups` / `puckPublishedPopups`)
 * since the storage-headroom hardening (2026-11-03). Metadata stays as plain
 * fields; the Popup's Puck tree is ONE JSON string. Firestore limits map/array
 * nesting to 20 levels, and a Popup tree stored as maps sat two levels deeper
 * than page content — its deepest real block (a Button's gradient stops in
 * Section → Row → Column) was exactly 20. As a string it adds no nesting, so
 * the stored Popup map is 3 levels deep whatever the blocks contain.
 *
 * Older docs hold `content` as a map (Slices 3–4.5); `normalizePopupMap` reads
 * both, and the next intentional save writes this shape. Nothing is bulk-migrated.
 */
export interface StoredPopupDefinition {
  id: string;
  name: string;
  trigger: PopupTrigger;
  style: PopupStyle;
  /** `JSON.stringify` of the Popup's Puck data. */
  contentJson: string;
  contentEncoding: typeof POPUP_CONTENT_ENCODING;
  createdAt?: string;
  updatedAt?: string;
}

export type StoredPopupMap = Record<string, StoredPopupDefinition>;

/** Same encoding as page content — one Puck storage codec (`puck-storage.ts`). */
export const POPUP_CONTENT_ENCODING = PUCK_JSON_ENCODING;

/** Popup map → the shape written to Firestore. Input must already be normalized. */
export function encodePopupMapForStorage(popups: PopupDefinitionMap): StoredPopupMap {
  const stored: StoredPopupMap = {};
  for (const [id, popup] of Object.entries(popups)) {
    stored[id] = {
      id,
      name: popup.name,
      trigger: popup.trigger,
      style: popup.style,
      contentJson: JSON.stringify(popup.content),
      contentEncoding: POPUP_CONTENT_ENCODING,
      // Firestore rejects `undefined`: only real timestamps are written.
      ...(typeof popup.createdAt === "string" ? { createdAt: popup.createdAt } : {}),
      ...(typeof popup.updatedAt === "string" ? { updatedAt: popup.updatedAt } : {}),
    };
  }
  return stored;
}

/** A Popup's Puck data from either storage shape; null when missing, malformed or in an unknown encoding. */
function readPopupContent(popup: { content?: unknown; contentJson?: unknown; contentEncoding?: unknown }): PuckData | null {
  if (typeof popup.contentJson === "string") {
    if (popup.contentEncoding !== undefined && popup.contentEncoding !== PUCK_JSON_ENCODING) return null;
    return parsePuckJson(popup.contentJson);
  }
  return isPuckData(popup.content) ? popup.content : null;
}

/**
 * Reads a Popup map from the client (editor payload) OR from Firestore in
 * either storage shape, and returns editor-shaped Popups. Entries that are
 * malformed (wrong id, missing fields, unreadable content) are dropped.
 */
export function normalizePopupMap(raw: unknown): PopupDefinitionMap {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const result: PopupDefinitionMap = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!value || typeof value !== "object") continue;
    const popup = value as Partial<PopupDefinition> & { contentJson?: unknown; contentEncoding?: unknown };
    if (popup.id !== key || typeof popup.name !== "string" || !popup.style) continue;
    const content = readPopupContent(popup);
    if (!content) continue;
    result[key] = {
      id: key,
      name: popup.name,
      content,
      // Missing (legacy) or malformed → Manual: never auto-opens, never crashes.
      trigger: normalizePopupTrigger(popup.trigger),
      style: { ...DEFAULT_POPUP_STYLE, ...(popup.style as Partial<PopupStyle>) },
      ...(typeof popup.createdAt === "string" ? { createdAt: popup.createdAt } : {}),
      ...(typeof popup.updatedAt === "string" ? { updatedAt: popup.updatedAt } : {}),
    };
  }
  return result;
}

export function collectPopupReferences(data: unknown): string[] {
  const found = new Set<string>();
  const visit = (value: unknown) => {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) return value.forEach(visit);
    const record = value as Record<string, unknown>;
    const action = record.action;
    if (action && typeof action === "object" && (action as Record<string, unknown>).type === "open_popup") {
      const id = (action as Record<string, unknown>).popupId;
      if (typeof id === "string" && id) found.add(id);
    }
    Object.values(record).forEach(visit);
  };
  visit(data);
  return [...found];
}

export function findStalePopupReferences(data: unknown, popups: PopupDefinitionMap): string[] {
  return collectPopupReferences(data).filter((id) => !popups[id]);
}
