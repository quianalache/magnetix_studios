import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { loadTenantAsset, tenantOf } from "@/lib/server/assets/media-library-service";
import {
  PageTemplateError,
  isExpiringSignedUrl,
  isValidSavedPageType,
  newestFirst,
  normalizeTemplateName,
  snapshotPageForTemplate,
  type ReportPageTemplateRecord,
} from "@/lib/energetics/report-page-templates";
import type { ReportTemplateSystem } from "@/lib/energetics/report-templates";
import type { ReportCanvasElement, ReportPage } from "@/types/report-blocks";

/**
 * Saved page templates (2026-10-12) — `reportPageTemplates/{id}`, a flat
 * top-level collection like `reportDesigns` (subAccountId / agencyId /
 * createdByUid on every doc). Server-only: no Firestore rule matches it, so
 * browsers are denied by default; every read and write goes through the
 * member-checked Energetic Decoder routes. A template is listed only for
 * the user who saved it, in the workspace it was saved in, and only that
 * user can rename or delete it.
 */

function col() {
  return getAdminDb().collection("reportPageTemplates");
}

function iso(value: unknown): string | null {
  if (value && typeof value === "object" && "toDate" in value && typeof (value as { toDate: unknown }).toDate === "function") {
    return (value as FirebaseFirestore.Timestamp).toDate().toISOString();
  }
  return null;
}

function toRecord(id: string, d: FirebaseFirestore.DocumentData): ReportPageTemplateRecord {
  return {
    id,
    subAccountId: d.subAccountId,
    createdByUid: d.createdByUid,
    name: d.name,
    system: d.system,
    pageType: d.pageType,
    page: d.page,
    createdAt: iso(d.createdAt),
    updatedAt: iso(d.updatedAt),
  };
}

/** The caller's own saved templates in this workspace, newest first. */
export async function listPageTemplates(subAccountId: string, uid: string): Promise<ReportPageTemplateRecord[]> {
  const snap = await col().where("subAccountId", "==", subAccountId).where("createdByUid", "==", uid).get();
  return snap.docs.map((d) => toRecord(d.id, d.data())).sort(newestFirst);
}

/**
 * Images in a template must keep working later. A page can still hold a
 * short-lived signed Media Library link (pages designed before images were
 * routed through public copies): when that library image already has its
 * public copy, the template uses it; otherwise the link is dropped (the
 * element stays, empty — readers see nothing) and the caller is told.
 * Never creates a public copy itself (that stays an explicit, confirmed
 * action in the image picker).
 */
async function lastingImages(subAccountId: string, elements: ReportCanvasElement[]): Promise<{ elements: ReportCanvasElement[]; swapped: number; cleared: number }> {
  let swapped = 0;
  let cleared = 0;
  const needsFix = elements.some((e) => (e.type === "image" || e.type === "upload") && isExpiringSignedUrl(e.payload?.url));
  if (!needsFix) return { elements, swapped, cleared };
  const tenant = await tenantOf(subAccountId);
  const out: ReportCanvasElement[] = [];
  for (const e of elements) {
    if ((e.type !== "image" && e.type !== "upload") || !isExpiringSignedUrl(e.payload?.url)) {
      out.push(e);
      continue;
    }
    let publicUrl: string | null = null;
    const assetId = typeof e.payload?.assetId === "string" ? e.payload.assetId : "";
    if (assetId) {
      try {
        publicUrl = (await loadTenantAsset(tenant, assetId)).publicImage?.url ?? null;
      } catch {
        publicUrl = null;
      }
    }
    if (publicUrl) swapped++;
    else cleared++;
    out.push({ ...e, payload: { ...e.payload, url: publicUrl ?? "" } });
  }
  return { elements: out, swapped, cleared };
}

export async function savePageTemplate(opts: {
  subAccountId: string;
  agencyId: string;
  uid: string;
  name: unknown;
  system: unknown;
  pageType: unknown;
  page: unknown;
}): Promise<{ template: ReportPageTemplateRecord; imagesSwapped: number; imagesCleared: number }> {
  const name = normalizeTemplateName(opts.name);
  if (!name) throw new PageTemplateError(400, "Give the template a name.");
  if (opts.system !== "humanDesign" && opts.system !== "astrology") throw new PageTemplateError(400, "Choose Human Design or Astrology.");
  const system = opts.system as ReportTemplateSystem;
  if (!isValidSavedPageType(system, opts.pageType)) throw new PageTemplateError(400, "Choose a page type.");
  const snapshot = snapshotPageForTemplate(opts.page);
  const { elements, swapped, cleared } = await lastingImages(opts.subAccountId, snapshot.elements ?? []);
  const page: Omit<ReportPage, "id"> = { ...snapshot, elements };
  const ref = col().doc();
  await ref.set({
    subAccountId: opts.subAccountId,
    agencyId: opts.agencyId,
    createdByUid: opts.uid,
    name,
    system,
    pageType: opts.pageType,
    page,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  const saved = await ref.get();
  return { template: toRecord(ref.id, saved.data()!), imagesSwapped: swapped, imagesCleared: cleared };
}

/** One of the caller's own templates in this workspace — anything else reads as not found. */
async function ownTemplateRef(subAccountId: string, uid: string, templateId: string) {
  if (!templateId || templateId.includes("/")) throw new PageTemplateError(404, "Template not found.");
  const ref = col().doc(templateId);
  const snap = await ref.get();
  const d = snap.data();
  if (!snap.exists || d?.subAccountId !== subAccountId || d?.createdByUid !== uid) throw new PageTemplateError(404, "Template not found.");
  return ref;
}

/** Renames the template record only — pages already inserted from it are independent copies and never change. */
export async function renamePageTemplate(subAccountId: string, uid: string, templateId: string, name: unknown): Promise<ReportPageTemplateRecord> {
  const n = normalizeTemplateName(name);
  if (!n) throw new PageTemplateError(400, "Give the template a name.");
  const ref = await ownTemplateRef(subAccountId, uid, templateId);
  await ref.update({ name: n, updatedAt: FieldValue.serverTimestamp() });
  const snap = await ref.get();
  return toRecord(snap.id, snap.data()!);
}

/** Removes it from the library only — report designs and generated reports never reference a template. */
export async function deletePageTemplate(subAccountId: string, uid: string, templateId: string): Promise<void> {
  const ref = await ownTemplateRef(subAccountId, uid, templateId);
  await ref.delete();
}
