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
                    width: "auto",
                    alignment: "left",
                    elements: [
                      { type: "Heading", props: { id: `${id}-heading`, text: name, level: "h2", alignment: "left" } },
                      { type: "Text", props: { id: `${id}-text`, text: "Add your popup content here.", alignment: "left" } },
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

export function normalizePopupMap(raw: unknown): PopupDefinitionMap {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const result: PopupDefinitionMap = {};
  for (const [key, value] of Object.entries(raw)) {
    if (!value || typeof value !== "object") continue;
    const popup = value as Partial<PopupDefinition>;
    if (popup.id !== key || typeof popup.name !== "string" || !popup.content || !popup.trigger || !popup.style) continue;
    result[key] = {
      ...(popup as PopupDefinition),
      style: { ...DEFAULT_POPUP_STYLE, ...(popup.style as Partial<PopupStyle>) },
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
