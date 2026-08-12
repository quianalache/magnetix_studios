import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { getReportDesign } from "@/lib/server/report-design-service";
import { getReadingById } from "@/lib/server/energetic-decoder-service";
import { evaluateChartRule, type ChartRuleReadingInput } from "@/lib/energetics/chart-rules";
import { resolveShortcodes, type ShortcodeReadingInput } from "@/lib/energetics/shortcodes";
import type { ReportPage } from "@/types/report-blocks";
import type { GeneratedReport } from "@/types/generated-report";

/**
 * Generated Reports — Phase 2 Build Plan Task 2 (2026-08-12), data layer
 * only. Flat top-level collection, same convention as `reportDesigns`/
 * `energeticDecoderReadings` (subAccountId/agencyId fields rather than
 * nested under the sub-account doc). No UI calls `createGeneratedReport`
 * yet — that's the later "Generate Report" task in the Build Plan's
 * sequence; this task is just the record + the real, testable logic that
 * produces it.
 */

function col() {
  return getAdminDb().collection("generatedReports");
}

/** Same fix/reasoning as report-design-service.ts's toIsoString. */
function toIsoString(value: unknown): string | null {
  if (value && typeof value === "object" && "toDate" in value && typeof (value as { toDate: unknown }).toDate === "function") {
    return (value as FirebaseFirestore.Timestamp).toDate().toISOString();
  }
  return null;
}

function toGeneratedReport(id: string, data: FirebaseFirestore.DocumentData): GeneratedReport {
  return {
    id,
    ...(data as Omit<GeneratedReport, "id">),
    generatedAt: toIsoString(data.generatedAt),
  };
}

export async function listGeneratedReports(
  subAccountId: string,
  opts?: { readingId?: string; reportDesignId?: string },
): Promise<GeneratedReport[]> {
  let q: FirebaseFirestore.Query = col().where("subAccountId", "==", subAccountId);
  if (opts?.readingId) q = q.where("readingId", "==", opts.readingId);
  if (opts?.reportDesignId) q = q.where("reportDesignId", "==", opts.reportDesignId);
  const snap = await q.get();
  return snap.docs.map((d) => toGeneratedReport(d.id, d.data()));
}

export async function getGeneratedReport(subAccountId: string, id: string): Promise<GeneratedReport | null> {
  const snap = await col().doc(id).get();
  if (!snap.exists || snap.data()?.subAccountId !== subAccountId) return null;
  return toGeneratedReport(snap.id, snap.data()!);
}

/**
 * The actual snapshot logic — filters pages by `visibleIf` and resolves
 * shortcodes exactly the way `ReportDesignViewer` renders them live,
 * against one specific reading, once, at generation time.
 */
function resolveSnapshotPages(pages: ReportPage[], ruleInput: ChartRuleReadingInput, shortcodeInput: ShortcodeReadingInput): ReportPage[] {
  const visiblePages = pages.filter((p) => !p.visibleIf || evaluateChartRule(p.visibleIf, ruleInput));
  return visiblePages.map((p) => ({
    ...p,
    blocks: p.blocks.map((b) => (b.type === "text" ? { ...b, html: resolveShortcodes(b.html, shortcodeInput) } : b)),
  }));
}

export async function createGeneratedReport(opts: {
  agencyId: string;
  subAccountId: string;
  reportDesignId: string;
  readingId: string;
  generatedByUid: string;
}): Promise<GeneratedReport | { error: string }> {
  const [design, reading] = await Promise.all([
    getReportDesign(opts.subAccountId, opts.reportDesignId),
    getReadingById(opts.subAccountId, opts.readingId),
  ]);
  if (!design) return { error: "Report design not found" };
  if (!reading) return { error: "Reading not found" };

  const ruleInput: ChartRuleReadingInput = { humanDesign: reading.humanDesign, astrology: reading.astrology };
  const shortcodeInput: ShortcodeReadingInput = {
    name: reading.name,
    birthDate: reading.birthDate,
    birthPlace: reading.birthPlace,
    humanDesign: reading.humanDesign,
    astrology: reading.astrology,
  };

  const doc = {
    subAccountId: opts.subAccountId,
    agencyId: opts.agencyId,
    reportDesignId: opts.reportDesignId,
    reportDesignTitleAtGeneration: design.title,
    readingId: opts.readingId,
    contactId: reading.contactId ?? null,
    generatedBy: opts.generatedByUid,
    snapshot: { pages: resolveSnapshotPages(design.pages, ruleInput, shortcodeInput) },
    generatedAt: FieldValue.serverTimestamp(),
  };
  const ref = await col().add(doc);
  return toGeneratedReport(ref.id, doc);
}
