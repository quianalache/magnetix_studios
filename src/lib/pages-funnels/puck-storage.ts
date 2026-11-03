import type { Data as PuckData } from "@puckeditor/core";

/**
 * Puck-tree storage codec (2026-11-03) — the ONE place a Puck tree is
 * turned into its Firestore representation and back.
 *
 * Firestore rejects maps/arrays nested deeper than 20 levels (production
 * probe 2026-11-02: 20 saved, 21 → bare 500; the emulator does NOT enforce
 * it). A Puck tree stored as maps spends most of that budget on its own
 * structure (Section → Row → Column → block → props → …): page content
 * reached 18 of 20, Popup content 20 of 20. Stored as one JSON string the
 * tree costs no nesting at all, whatever its blocks contain.
 *
 *  - Page content (`puckDraftData` / `puckPublishedData`) is stored as an
 *    envelope `{ encoding: "puck-json-v1", json }` in the SAME fields, so
 *    every "is there published data?" check keeps working unchanged.
 *  - Popup content uses the same encoding inside each stored Popup
 *    (`contentJson` + `contentEncoding`, see pages-funnels-popup.ts).
 *
 * The application never sees strings: Puck, renderers, Preview, AI page
 * generation and every reader work with normal Puck objects. Encode at the
 * write boundary, decode at the read boundary.
 *
 * Older docs hold the tree as maps ("legacy"). Readers accept both; the next
 * intentional save / publish writes the envelope. Nothing is bulk-migrated.
 */

export const PUCK_JSON_ENCODING = "puck-json-v1" as const;

/** Stored Page Puck content. */
export interface EncodedPuckData {
  encoding: typeof PUCK_JSON_ENCODING;
  /** `JSON.stringify` of the Puck tree. */
  json: string;
}

/** What a page-doc Puck field may hold: the envelope, or the older map-stored tree. */
export type StoredPuckData = EncodedPuckData | PuckData;

/**
 * Application sanity cap on a decoded Puck tree's nesting (NOT a Firestore
 * limit — Firestore never sees the tree's structure now). The deepest real
 * tree today is ~18; this only refuses pathological / malformed data.
 */
export const PUCK_CONTENT_MAX_DEPTH = 48;

/** A real Puck tree: an object with a `content` array. */
export function isPuckData(value: unknown): value is PuckData {
  return !!value && typeof value === "object" && !Array.isArray(value) && Array.isArray((value as { content?: unknown }).content);
}

/** Parses an encoded Puck tree; null when the JSON is unreadable or isn't a Puck tree. */
export function parsePuckJson(json: string): PuckData | null {
  try {
    const parsed: unknown = JSON.parse(json);
    return isPuckData(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function encodePuckData(data: PuckData): EncodedPuckData {
  return { encoding: PUCK_JSON_ENCODING, json: JSON.stringify(data) };
}

export type PuckDecodeFailure = "missing" | "unsupported-encoding" | "malformed-json" | "invalid-shape";

export type PuckDecodeResult =
  | { ok: true; data: PuckData; stored: "encoded" | "legacy" }
  | { ok: false; reason: PuckDecodeFailure };

/**
 * Stored page Puck field → Puck object. Never invents content: anything it
 * can't read is a failure the caller must surface (the builder shows a load
 * error instead of an empty canvas that would autosave over the original).
 */
export function decodeStoredPuckData(raw: unknown): PuckDecodeResult {
  if (raw == null) return { ok: false, reason: "missing" };
  if (typeof raw !== "object" || Array.isArray(raw)) return { ok: false, reason: "invalid-shape" };
  const record = raw as Record<string, unknown>;
  if ("encoding" in record || "json" in record) {
    if (record.encoding !== PUCK_JSON_ENCODING) return { ok: false, reason: "unsupported-encoding" };
    if (typeof record.json !== "string") return { ok: false, reason: "malformed-json" };
    let parsed: unknown;
    try {
      parsed = JSON.parse(record.json);
    } catch {
      return { ok: false, reason: "malformed-json" };
    }
    return isPuckData(parsed) ? { ok: true, data: parsed, stored: "encoded" } : { ok: false, reason: "invalid-shape" };
  }
  return isPuckData(raw) ? { ok: true, data: raw, stored: "legacy" } : { ok: false, reason: "invalid-shape" };
}

/** Convenience for readers that treat "unreadable" like "absent" (never for anything that writes back). */
export function readStoredPuckData(raw: unknown): PuckData | null {
  const result = decodeStoredPuckData(raw);
  return result.ok ? result.data : null;
}
