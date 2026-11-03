import type { Data as PuckData } from "@puckeditor/core";

export type PopupTrigger =
  | { type: "manual" }
  | { type: "delay"; delaySeconds: number; oncePerPageView: boolean }
  | { type: "exit_intent"; oncePerPageView: boolean };

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

export const POPUP_CONTENT_ENCODING = "puck-json-v1" as const;

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

/** A Popup's Puck data from either storage shape; null when missing or malformed. */
function readPopupContent(popup: { content?: unknown; contentJson?: unknown }): PuckData | null {
  let content: unknown = popup.content;
  if (typeof popup.contentJson === "string") {
    try {
      content = JSON.parse(popup.contentJson);
    } catch {
      return null;
    }
  }
  if (!content || typeof content !== "object" || !Array.isArray((content as { content?: unknown }).content)) return null;
  return content as PuckData;
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
    if (popup.id !== key || typeof popup.name !== "string" || !popup.trigger || !popup.style) continue;
    const content = readPopupContent(popup);
    if (!content) continue;
    result[key] = {
      id: key,
      name: popup.name,
      content,
      trigger: popup.trigger,
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
