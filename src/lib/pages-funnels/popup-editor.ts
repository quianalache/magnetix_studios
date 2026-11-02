import type { Data as PuckData } from "@puckeditor/core";
import type { PopupDefinition, PopupDefinitionMap, PopupStyle } from "@/types/pages-funnels-popup";
import { DEFAULT_POPUP_STYLE } from "@/types/pages-funnels-popup";

/**
 * Popup authoring (Wave 2A Slice 4.5) — pure, testable helpers.
 *
 * In Popup Edit Mode the ONE Puck editor edits the selected Popup's own
 * content tree. The Popup FRAME (overlay, panel, close behavior) is that
 * tree's root: selecting nothing selects the frame, and the frame's settings
 * are the root's single `frame` field. The frame lives in root props only
 * while editing — `popupFromEditorData` moves it back onto the Popup's
 * `name`/`style`, so a saved Popup's `content.root` stays empty exactly as
 * before.
 */

export interface PopupFrameValue {
  name: string;
  style: PopupStyle;
}

/** The Puck data the editor mounts for one Popup. */
export function popupToEditorData(popup: PopupDefinition): PuckData {
  const content = popup.content ?? { root: { props: {} }, content: [] };
  return {
    root: { props: { frame: { name: popup.name, style: { ...DEFAULT_POPUP_STYLE, ...popup.style } } satisfies PopupFrameValue } },
    content: Array.isArray(content.content) ? content.content : [],
    ...(content.zones ? { zones: content.zones } : {}),
  } as PuckData;
}

/** Folds an editor change back into the Popup it belongs to (never another one). */
export function popupFromEditorData(popup: PopupDefinition, data: PuckData): PopupDefinition {
  const frame = (data.root?.props as { frame?: Partial<PopupFrameValue> } | undefined)?.frame;
  const name = typeof frame?.name === "string" ? frame.name : popup.name;
  const style = frame?.style ? { ...popup.style, ...frame.style } : popup.style;
  return {
    ...popup,
    name,
    style,
    content: {
      root: { props: {} },
      content: data.content ?? [],
      ...(data.zones && Object.keys(data.zones).length ? { zones: data.zones } : {}),
    } as PuckData,
  };
}

/** Applies an editor change to the map — only the Popup being edited changes. */
export function applyPopupEditorChange(popups: PopupDefinitionMap, popupId: string, data: PuckData): PopupDefinitionMap {
  const popup = popups[popupId];
  if (!popup) return popups;
  return { ...popups, [popupId]: popupFromEditorData(popup, data) };
}

export type PopupPublishState = "published" | "changed" | "draft";

/** Manager status: never published, published and unchanged, or changed since publish. */
export function popupPublishState(draft: PopupDefinition, published: PopupDefinitionMap | null | undefined): PopupPublishState {
  const live = published?.[draft.id];
  if (!live) return "draft";
  const strip = (p: PopupDefinition) => JSON.stringify({ name: p.name, content: p.content, style: p.style });
  return strip(live) === strip(draft) ? "published" : "changed";
}

/** Next free default name: "Popup 1", "Popup 2", … */
export function nextPopupName(popups: PopupDefinitionMap): string {
  const taken = new Set(Object.values(popups).map((p) => p.name.trim().toLowerCase()));
  for (let n = 1; ; n += 1) if (!taken.has(`popup ${n}`)) return `Popup ${n}`;
}

/* Frame presets — owner-facing choices instead of raw CSS strings. */

export interface FramePreset { value: string; label: string; css: string }

export const POPUP_BORDER_PRESETS: FramePreset[] = [
  { value: "none", label: "None", css: "none" },
  { value: "subtle", label: "Subtle", css: DEFAULT_POPUP_STYLE.panelBorder },
  { value: "strong", label: "Strong", css: "2px solid rgba(22, 11, 47, 0.28)" },
];

export const POPUP_SHADOW_PRESETS: FramePreset[] = [
  { value: "none", label: "None", css: "none" },
  { value: "soft", label: "Soft", css: "0 8px 30px rgba(22, 11, 47, 0.12)" },
  { value: "medium", label: "Medium", css: DEFAULT_POPUP_STYLE.panelShadow },
  { value: "strong", label: "Strong", css: "0 32px 120px rgba(22, 11, 47, 0.38)" },
];

/** The preset a stored CSS value matches, or "custom" for an older/unknown value (kept as is). */
export function presetFor(presets: FramePreset[], css: string): string {
  return presets.find((p) => p.css === css)?.value ?? "custom";
}

/**
 * Panel width. The runtime draws `width` capped at `min(maxWidth, viewport − 32px)`,
 * so one "Width" control (the max) is the honest owner-facing size: editing it
 * also sets `panelWidth` to 100% so the panel really reaches that width.
 */
export function withPanelMaxWidth(style: PopupStyle, maxWidth: number): PopupStyle {
  const clamped = Math.round(Math.min(1200, Math.max(280, maxWidth)));
  return { ...style, panelMaxWidth: clamped, panelWidth: "100%" };
}

/** The overlay's rgba() — shared by the public runtime and the editor canvas so both draw the same overlay. */
export function overlayColor(hex: string, opacity: number): string {
  const value = hex.replace("#", "");
  const alpha = Math.max(0, Math.min(1, opacity));
  if (!/^[0-9a-f]{6}$/i.test(value)) return `rgba(22, 11, 47, ${alpha})`;
  const [r, g, b] = [0, 2, 4].map((index) => parseInt(value.slice(index, index + 2), 16));
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
