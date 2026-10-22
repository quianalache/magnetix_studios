import type { ChartDesign } from "@/types/chart-design";
import type { EnergeticDecoderReading } from "@/types/energetic-decoder";

/**
 * Reading Tool Preview → custom Reading Result Page (2026-10-21). Preview
 * calculates a real Reading but saves nothing, so there's no Reading id to
 * hand a page. Instead the tool parks the unsaved Reading in this browser
 * (same-origin localStorage, staff only) and opens the page's draft in the
 * builder Preview, which reads it (kept for 30 minutes so a refresh still
 * works, then ignored). Never reaches a visitor and never touches Firestore.
 */
export const READING_PREVIEW_STORAGE_PREFIX = "mx-reading-preview:";

/** Ignore a hand-off older than this (a stale tab reopened later). */
export const READING_PREVIEW_MAX_AGE_MS = 30 * 60 * 1000;

export interface ReadingPreviewHandoff {
  at: number;
  reading: EnergeticDecoderReading;
  accent: string;
  designs: { hdDesign: ChartDesign | null; mandalaDesign: ChartDesign | null; astroDesign: ChartDesign | null };
}

export function readReadingPreviewHandoff(pageId: string): ReadingPreviewHandoff | null {
  try {
    const raw = localStorage.getItem(`${READING_PREVIEW_STORAGE_PREFIX}${pageId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ReadingPreviewHandoff;
    if (!parsed?.reading || typeof parsed.at !== "number" || Date.now() - parsed.at > READING_PREVIEW_MAX_AGE_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}
