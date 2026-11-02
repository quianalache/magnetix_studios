import type { Data as PuckData } from "@puckeditor/core";

export const POPUP_ALLOWED_BLOCKS = new Set([
  "Section", "Row", "Column", "Heading", "Text", "RichText", "Button", "Image", "Video", "Divider", "Spacer", "Accordion", "Icon", "Form",
]);

export interface PopupContentIssue { path: string; message: string; type?: string }

export function validatePopupContent(data: unknown): PopupContentIssue[] {
  const issues: PopupContentIssue[] = [];
  const visit = (value: unknown, path: string, inspectNode = false) => {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) return value.forEach((item, index) => visit(item, `${path}[${index}]`, true));
    const node = value as { type?: unknown; props?: Record<string, unknown> };
    if (inspectNode && typeof node.type === "string") {
      if (node.type === "Popup") issues.push({ path, message: "Nested Popups are not allowed.", type: node.type });
      else if (!POPUP_ALLOWED_BLOCKS.has(node.type)) issues.push({ path, message: `Block ${node.type} is not allowed in a Popup.`, type: node.type });
      const action = node.props?.action as { type?: unknown } | undefined;
      if (action?.type === "open_popup" || action?.type === "close_popup") issues.push({ path, message: "Popup actions are reserved for Slice 5.", type: node.type });
    }
    Object.entries(node.props ?? {}).forEach(([key, child]) => visit(child, `${path}.${key}`, key === "content" || key === "children"));
  };
  visit((data as { content?: unknown } | null)?.content, "content", true);
  return issues;
}

export function sanitizePopupContent(data: unknown): PuckData {
  const source = data && typeof data === "object" ? data as { root?: unknown; content?: unknown; zones?: unknown } : {};
  const clean = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const node = item as { type?: unknown; props?: Record<string, unknown> };
      if (typeof node.type === "string" && !POPUP_ALLOWED_BLOCKS.has(node.type)) return [];
      const props = Object.fromEntries(Object.entries(node.props ?? {})
        .filter(([key, child]) => !(key === "action" && child && typeof child === "object" && ["open_popup", "close_popup"].includes(String((child as { type?: unknown }).type))))
        .map(([key, child]) => [key, clean(child)]));
      return [{ ...node, props }];
    });
    if (!value || typeof value !== "object") return value;
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, clean(child)]));
  };
  return {
    root: (source.root && typeof source.root === "object" ? source.root : { props: {} }) as PuckData["root"],
    content: (clean(source.content) as PuckData["content"]) ?? [],
    ...(source.zones && typeof source.zones === "object" ? { zones: clean(source.zones) as PuckData["zones"] } : {}),
  };
}

/**
 * The page's content plus every Popup's content, for the server-side
 * resolvers (forms, action targets, embeds, offers) — so a Form or a
 * Button inside a Popup resolves exactly like one on the page. Only used
 * to COLLECT ids; never rendered.
 */
export function withPopupContent(data: PuckData, popups: Record<string, { content?: PuckData }> | null | undefined): PuckData {
  const extra = Object.values(popups ?? {}).flatMap((popup) => (Array.isArray(popup?.content?.content) ? popup.content.content : []));
  return extra.length ? { ...data, content: [...(data.content ?? []), ...extra] } : data;
}

/**
 * Firestore rejects a document whose maps/arrays nest deeper than 20 levels
 * (confirmed in production 2026-11-02: a Popup at 20 levels saved, 21 failed
 * with a bare 500). Popups live two levels deeper than page content
 * (`puckDraftPopups.{id}.content` vs `puckDraftData`), and a Button's
 * gradient background inside Section → Row → Column already reaches 20 — so
 * the save path checks depth and returns a clear error instead.
 */
export const FIRESTORE_MAX_FIELD_DEPTH = 20;

/** Map/array nesting depth of a stored field value (a scalar is 0, `{a: 1}` is 1). */
export function fieldDepth(value: unknown): number {
  if (!value || typeof value !== "object") return 0;
  let max = 0;
  for (const child of Object.values(value)) max = Math.max(max, fieldDepth(child));
  return 1 + max;
}
