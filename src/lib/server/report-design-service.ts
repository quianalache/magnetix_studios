import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { emptyReportDesign, type ReportDesign, type ReportPage } from "@/types/report-blocks";

/**
 * Report Builder — Phase 2 (2026-08-09). Real drag-and-drop report designs,
 * the Energetic Decoder equivalent of Bodygraph's "Reading Reports" list
 * (toured on her real account the same day: id/title/pages, a "Create new"
 * flow, per-design edit). Flat top-level collection, matching the existing
 * `energeticDecoderReadings` convention (subAccountId/agencyId fields
 * rather than nested under the sub-account doc).
 */

function col() {
  return getAdminDb().collection("reportDesigns");
}

/**
 * Same fix, same reasoning as chart-design-service.ts's `toIsoString` —
 * ReportDesign crosses into ReportDesignViewer (a Client Component) at
 * /decoder/[saId]/report/[readingId]/design/[reportId], and a raw
 * Firestore Timestamp/FieldValue isn't plain-serializable across that
 * boundary. Fixed 2026-08-11 alongside the public decoder form's
 * identical, already-confirmed 500.
 */
function toIsoString(value: unknown): string | null {
  if (value && typeof value === "object" && "toDate" in value && typeof (value as { toDate: unknown }).toDate === "function") {
    return (value as FirebaseFirestore.Timestamp).toDate().toISOString();
  }
  return null;
}

function toDesign(id: string, data: FirebaseFirestore.DocumentData): ReportDesign {
  return {
    id,
    ...(data as Omit<ReportDesign, "id">),
    createdAt: toIsoString(data.createdAt),
    updatedAt: toIsoString(data.updatedAt),
  };
}

export async function listReportDesigns(subAccountId: string): Promise<ReportDesign[]> {
  const snap = await col().where("subAccountId", "==", subAccountId).get();
  return snap.docs.map((d) => toDesign(d.id, d.data()));
}

export async function getReportDesign(subAccountId: string, designId: string): Promise<ReportDesign | null> {
  const snap = await col().doc(designId).get();
  if (!snap.exists || snap.data()?.subAccountId !== subAccountId) return null;
  return toDesign(snap.id, snap.data()!);
}

export async function createReportDesign(opts: {
  agencyId: string;
  subAccountId: string;
  title: string;
}): Promise<ReportDesign> {
  const doc = {
    subAccountId: opts.subAccountId,
    agencyId: opts.agencyId,
    title: opts.title.trim() || "Untitled Report",
    ...emptyReportDesign(),
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };
  const ref = await col().add(doc);
  return toDesign(ref.id, doc);
}

export async function updateReportDesign(
  subAccountId: string,
  designId: string,
  fields: Partial<Pick<ReportDesign, "title" | "pages">>,
): Promise<ReportDesign> {
  const ref = col().doc(designId);
  const snap = await ref.get();
  if (!snap.exists || snap.data()?.subAccountId !== subAccountId) throw new Error("Report design not found");
  await ref.update({ ...fields, updatedAt: FieldValue.serverTimestamp() });
  const updated = await ref.get();
  return toDesign(updated.id, updated.data()!);
}

export async function deleteReportDesign(subAccountId: string, designId: string): Promise<void> {
  const ref = col().doc(designId);
  const snap = await ref.get();
  if (!snap.exists || snap.data()?.subAccountId !== subAccountId) throw new Error("Report design not found");
  await ref.delete();
}

export type { ReportPage };
