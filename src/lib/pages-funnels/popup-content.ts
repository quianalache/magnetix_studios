import type { Data as PuckData } from "@puckeditor/core";
import { PUCK_CONTENT_MAX_DEPTH } from "@/lib/pages-funnels/puck-storage";

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
 * Page-doc storage limits (storage contract of 2026-11-03). Page AND Popup
 * Puck trees are stored as JSON strings (`puck-storage.ts`), so their
 * structure no longer counts toward Firestore's 20-level map/array limit;
 * the stored doc's own fields are a few levels deep. FIRESTORE_MAX_FIELD_DEPTH
 * stays as a check on what is actually written.
 */
export const FIRESTORE_MAX_FIELD_DEPTH = 20;

/** Application sanity cap on a decoded Popup tree (same cap as page content). */
export const POPUP_CONTENT_MAX_DEPTH = PUCK_CONTENT_MAX_DEPTH;

/** All Popups on one page, encoded. */
export const POPUP_PAYLOAD_LIMIT_BYTES = 700_000;

/** The whole page doc (draft + published page + both Popup maps). Firestore's hard cap is 1 MiB. */
export const PAGE_DOC_SIZE_LIMIT_BYTES = 900_000;

/**
 * Firestore storage size of a value, per Firestore's documented rules
 * (string = UTF-8 bytes + 1, number 8, boolean/null 1, map = Σ field-name
 * bytes + 1 + value). What the 1 MiB document cap actually counts — unlike
 * `JSON.stringify(...).length`, which double-counts the escaped quotes
 * inside an encoded Puck string.
 */
const utf8 = new TextEncoder();
const utf8Bytes = (text: string) => utf8.encode(text).length;

export function firestoreStorageSize(value: unknown): number {
  if (value == null) return 1;
  if (typeof value === "string") return utf8Bytes(value) + 1;
  if (typeof value === "number") return 8;
  if (typeof value === "boolean") return 1;
  if (Array.isArray(value)) return value.reduce((n: number, item) => n + firestoreStorageSize(item), 0);
  if (typeof value === "object") {
    if (typeof (value as { toDate?: unknown }).toDate === "function") return 8;
    return Object.entries(value).reduce((n, [key, item]) => n + utf8Bytes(key) + 1 + firestoreStorageSize(item), 0);
  }
  return 8;
}

/** Map/array nesting depth of a stored field value (a scalar is 0, `{a: 1}` is 1). */
export function fieldDepth(value: unknown): number {
  if (!value || typeof value !== "object") return 0;
  let max = 0;
  for (const child of Object.values(value)) max = Math.max(max, fieldDepth(child));
  return 1 + max;
}
