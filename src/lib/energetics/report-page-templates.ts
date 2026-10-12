import type { ReportCanvasElement, ReportPage } from "@/types/report-blocks";
import { asCenterKey } from "./shortcodes";
import { REPORT_TEMPLATE_PAGE_TYPES, type ReportTemplate, type ReportTemplatePageType, type ReportTemplateSystem } from "./report-templates";

/**
 * Saved page templates (2026-10-12) — a user saves ONE page of a report to
 * reuse it. Templates are page templates only (whole-report reuse is
 * Duplicate Report). A saved template belongs to one system and one page
 * type ("Other" when none fits), lives in the user's workspace, and is
 * listed only for the user who saved it ("Mine").
 *
 * The record keeps a snapshot of the page exactly as designed — elements,
 * geometry, styles, text, Shortcode tokens / inline {{tokens}} (never
 * resolved values), chart parts with their saved Chart Design reference
 * (never copied colors), images (lasting public URLs only — see the server
 * service), Page Center and visibility. Inserting one goes through the same
 * instantiateReportTemplate() as the built-in templates: a fresh,
 * independent page with new page + element ids and no link back.
 */

export type SavedTemplatePageType = ReportTemplatePageType;

export interface ReportPageTemplateRecord {
  id: string;
  subAccountId: string;
  createdByUid: string;
  name: string;
  system: ReportTemplateSystem;
  pageType: SavedTemplatePageType;
  /** The page snapshot (no page id — insertion always makes a fresh one). */
  page: Omit<ReportPage, "id">;
  createdAt: string | null;
  updatedAt: string | null;
}

export const MAX_TEMPLATE_NAME = 80;
export const MAX_TEMPLATE_ELEMENTS = 400;
/** Serialized page snapshot limit (a Firestore document holds 1 MiB). */
export const MAX_TEMPLATE_PAGE_BYTES = 400_000;

/** Page types a saved template can use for a system: that system's categories plus Other. */
export function savedTemplatePageTypes(system: ReportTemplateSystem): ReportTemplatePageType[] {
  return [...REPORT_TEMPLATE_PAGE_TYPES[system], "Other"];
}

export function isValidSavedPageType(system: ReportTemplateSystem, pageType: unknown): pageType is SavedTemplatePageType {
  return typeof pageType === "string" && (savedTemplatePageTypes(system) as string[]).includes(pageType);
}

export function normalizeTemplateName(name: unknown): string | null {
  if (typeof name !== "string") return null;
  const n = name.replace(/\s+/g, " ").trim().slice(0, MAX_TEMPLATE_NAME);
  return n || null;
}

/** GCS / S3 signed links expire (the Media Library hands out 30-minute ones); a template must never keep one. */
export function isExpiringSignedUrl(url: unknown): boolean {
  if (typeof url !== "string" || !url) return false;
  try {
    const q = new URL(url).searchParams;
    return q.has("X-Goog-Signature") || q.has("X-Goog-Expires") || q.has("X-Amz-Signature") || (q.has("Expires") && (q.has("Signature") || q.has("GoogleAccessId")));
  } catch {
    return false;
  }
}

export class PageTemplateError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/**
 * The page snapshot a template stores: the page as designed, minus its id
 * and anything that only exists at render time — attached Chart Design
 * records (`chartDesigns`; the template keeps only `chartDesignSetId`) and
 * frozen Shortcode values (`resolvedText`; the template keeps the token).
 * Throws PageTemplateError for pages that can't be stored.
 */
export function snapshotPageForTemplate(page: unknown): Omit<ReportPage, "id"> {
  if (!page || typeof page !== "object") throw new PageTemplateError(400, "Choose a page to save.");
  const p = page as ReportPage;
  const elements = Array.isArray(p.elements) ? p.elements : [];
  if (elements.length > MAX_TEMPLATE_ELEMENTS) throw new PageTemplateError(400, `A template can hold up to ${MAX_TEMPLATE_ELEMENTS} elements.`);
  const cleanElements = elements
    .filter((e): e is ReportCanvasElement => !!e && typeof e === "object" && typeof (e as ReportCanvasElement).type === "string" && !!(e as ReportCanvasElement).geometry)
    .map((e) => {
      const { chartDesigns: _cd, resolvedText: _rt, ...payload } = (e.payload ?? {}) as Record<string, unknown>;
      void _cd;
      void _rt;
      return { ...e, payload } as ReportCanvasElement;
    });
  const centerKey = asCenterKey(p.centerKey);
  const snapshot: Omit<ReportPage, "id"> = {
    title: typeof p.title === "string" ? p.title.slice(0, 200) : "",
    visibleIf: p.visibleIf && typeof p.visibleIf === "object" ? p.visibleIf : null,
    blocks: Array.isArray(p.blocks) ? p.blocks : [],
    elements: cleanElements,
    ...(centerKey ? { centerKey } : {}),
    ...(typeof p.pageBackground === "string" && p.pageBackground ? { pageBackground: p.pageBackground } : {}),
    ...(p.locked ? { locked: true } : {}),
  };
  if (JSON.stringify(snapshot).length > MAX_TEMPLATE_PAGE_BYTES) throw new PageTemplateError(400, "This page is too large to save as a template.");
  return snapshot;
}

/** A library entry for a saved template (inserted exactly like a built-in one). */
export type SavedLibraryTemplate = ReportTemplate & { saved: NonNullable<ReportTemplate["saved"]> };

export function savedTemplateToLibrary(t: ReportPageTemplateRecord): SavedLibraryTemplate {
  return {
    id: `saved:${t.id}`,
    name: t.name,
    system: t.system,
    pageType: t.pageType,
    styleTag: null,
    page: { ...t.page, id: `saved:${t.id}` } as ReportPage,
    saved: { id: t.id, createdAt: t.createdAt },
  };
}

export function isSavedTemplate(t: ReportTemplate): t is SavedLibraryTemplate {
  return !!(t as SavedLibraryTemplate).saved;
}

/** Newest first (ISO timestamps sort as strings; missing dates last). */
export function newestFirst<T extends { createdAt: string | null }>(a: T, b: T): number {
  return (b.createdAt ?? "").localeCompare(a.createdAt ?? "");
}
