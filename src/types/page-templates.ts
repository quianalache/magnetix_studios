import type { PageGoal, PageType } from "@/types/pages-funnels";

/**
 * Saved Page Templates (2026-11-16) — a creator-saved, reusable snapshot of
 * one Pages & Funnels page design, shared with every member of the SAME
 * workspace. Stored server-only at `pageTemplates/{id}` (Firestore rules
 * default-deny; every read and write goes through /api/pages-funnels/templates).
 *
 * A template is a design, not a page: it has no URL, no publish state, no
 * analytics and no funnel. Creating a page from it makes a new, independent
 * Draft page; editing that page never changes the template, and editing or
 * deleting the source page never changes it either.
 */

/** Template-owned preview image (a screenshot of the template itself). */
export interface PageTemplatePreview {
  url: string;
  storageKey: string;
  capturedAt: number;
  width: number;
  height: number;
}

export type PageTemplatePreviewStatus = "pending" | "ready" | "failed";

/** Retained live connections in a design (counts), shown after Create from Template. */
export interface PageTemplateConnections {
  forms: number;
  bookings: number;
  offers: number;
  readingTools: number;
  pageLinks: number;
  videos: number;
  checkouts: number;
  popups: number;
}

/** What the library lists (no design payload). */
export interface PageTemplateSummary {
  id: string;
  name: string;
  description: string;
  pageType: PageType;
  goal: PageGoal;
  createdAt: number;
  updatedAt: number;
  createdByName: string;
  preview: Pick<PageTemplatePreview, "url" | "width" | "height"> | null;
  previewStatus: PageTemplatePreviewStatus;
  connections: PageTemplateConnections;
}

/** The stored document (server-only). */
export interface PageTemplateDoc {
  agencyId: string | null;
  subAccountId: string;
  name: string;
  description: string;
  pageType: PageType;
  goal: PageGoal;
  /** The page design — `puck-json-v1` envelope (same storage as a page draft). */
  puckData: unknown;
  /** The page's Popups — stored popup map (same storage as a page draft). */
  popups: unknown;
  /** Reading Result Pages: the page's Chart Design + builder sample (design settings only). */
  readingResult: unknown | null;
  /** The page's social preview image at save time (kept as a design asset). */
  socialImage: string;
  connections: PageTemplateConnections;
  /** Attribution only — never used to render or resolve the template. */
  sourcePageId: string | null;
  createdByUid: string;
  createdByName: string;
  createdAt: number;
  updatedAt: number;
  preview: PageTemplatePreview | null;
  previewStatus: PageTemplatePreviewStatus;
  previewRequestedAt: number | null;
}
