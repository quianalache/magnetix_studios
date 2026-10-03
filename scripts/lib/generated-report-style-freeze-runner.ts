/**
 * Unified Chart Designs — freezes the chart styling of generated reports
 * created BEFORE styling was captured at generation (2026-10).
 *
 * It records each report's CURRENT appearance — the designs its reading
 * resolves to right now, via the same shared resolver the PDF/preview
 * routes use — tagged `source: "frozen-at-migration"`. It can't recover
 * the styling the report had when it was generated: that was never saved.
 * Run it BEFORE designs are edited in the new editor so today's
 * appearance is what gets kept.
 *
 * Only adds `snapshot.chartStyles` to reports that don't have it (checked
 * again inside a transaction per report); never touches pages, content,
 * or any other field, and never regenerates a report.
 */
import type { Firestore } from "firebase-admin/firestore";
import type { GeneratedReportChartStyles } from "../../src/types/generated-report";
import { resolveReadingChartDesigns } from "../../src/lib/energetics/chart-design-resolution";
import { loadSubAccountChartData } from "./chart-design-set-migration-runner";

export interface ReportFreezePlanItem {
  reportId: string;
  subAccountId: string;
  readingId: string;
  /** Null when the source reading is gone — such a report can't render charts at all; left untouched. */
  chartStyles: GeneratedReportChartStyles | null;
  note: string;
}

export async function planGeneratedReportStyleFreeze(db: Firestore, now = new Date()): Promise<ReportFreezePlanItem[]> {
  const reports = await db.collection("generatedReports").get();
  const items: ReportFreezePlanItem[] = [];
  const cache = new Map<string, Awaited<ReturnType<typeof loadSubAccountChartData>>>();
  for (const doc of reports.docs) {
    const r = doc.data();
    if (r.snapshot?.chartStyles) continue;
    const subAccountId = r.subAccountId as string;
    const readingId = r.readingId as string;
    const readingSnap = await db.doc(`energeticDecoderReadings/${readingId}`).get();
    if (!readingSnap.exists || readingSnap.get("subAccountId") !== subAccountId) {
      items.push({ reportId: doc.id, subAccountId, readingId, chartStyles: null, note: "source reading not found — left as is" });
      continue;
    }
    const reading = readingSnap.data()!;
    if (!cache.has(subAccountId)) cache.set(subAccountId, await loadSubAccountChartData(db, subAccountId));
    const data = cache.get(subAccountId)!;
    const profile = reading.profileId ? (data.profiles.find((p) => p.id === reading.profileId) ?? null) : null;
    const resolved = resolveReadingChartDesigns({ subAccountId, designs: data.designs, sets: data.sets, profile }, reading);
    items.push({
      reportId: doc.id,
      subAccountId,
      readingId,
      chartStyles: {
        source: "frozen-at-migration",
        frozenAt: now.toISOString(),
        setId: resolved.setId,
        setName: resolved.setName,
        humanDesign: resolved.hdDesign,
        mandala: resolved.mandalaDesign,
        astrology: resolved.astroDesign,
        frequency: null,
      },
      note: `current appearance: HD ${resolved.hdDesign?.id ?? "none"}, Mandala ${resolved.mandalaDesign?.id ?? "none"}, Astrology ${resolved.astroDesign?.id ?? "none"}`,
    });
  }
  return items;
}

export async function runGeneratedReportStyleFreeze(opts: {
  db: Firestore;
  live?: boolean;
  expect?: number;
}): Promise<{ live: boolean; plan: ReportFreezePlanItem[]; frozen: string[]; refused: string | null }> {
  const { db } = opts;
  const live = opts.live === true;
  const plan = await planGeneratedReportStyleFreeze(db);
  const freezable = plan.filter((p) => p.chartStyles);
  const out = { live, plan, frozen: [] as string[], refused: null as string | null };
  if (!live) return out;
  if (opts.expect !== freezable.length) {
    out.refused = `Expected ${opts.expect ?? "(none)"} reports but the plan freezes ${freezable.length} — nothing written.`;
    return out;
  }
  for (const item of freezable) {
    const ref = db.collection("generatedReports").doc(item.reportId);
    const wrote = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists || snap.get("snapshot.chartStyles")) return false;
      tx.update(ref, { "snapshot.chartStyles": item.chartStyles });
      return true;
    });
    if (wrote) out.frozen.push(item.reportId);
  }
  return out;
}
