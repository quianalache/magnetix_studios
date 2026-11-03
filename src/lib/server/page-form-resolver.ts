import "server-only";

import { getAdminDb } from "@/lib/firebase/admin";
import type { LeadForm } from "@/types/forms";

/**
 * The ONE place a Page / Popup Form block's `formId` becomes a Form
 * (2026-11-03 tenant-safety hardening). Every caller passes the
 * AUTHORITATIVE sub-account — the page's own `subAccountId`, read
 * server-side — never a client-supplied one:
 *  - published pages (`/p/[pageId]`, Reading Result pages): `page.subAccountId`
 *  - builder canvas + Preview (`/api/pages-funnels/puck/resolve-form`): the
 *    page named by `pageId`, after checking the caller may open that workspace
 *
 * A Form belonging to another sub-account resolves exactly like a missing
 * one (`null`), so a page can never render — or reveal the existence of — a
 * foreign Form. Malformed ids never reach Firestore.
 */

const FORM_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

export function isWellFormedFormId(formId: unknown): formId is string {
  return typeof formId === "string" && FORM_ID_PATTERN.test(formId);
}

export async function resolveFormsForSubAccount(
  subAccountId: string | null | undefined,
  formIds: readonly string[],
): Promise<Record<string, LeadForm | null>> {
  const resolved: Record<string, LeadForm | null> = {};
  const unique = [...new Set(formIds)];
  for (const id of unique) resolved[id] = null;
  if (!subAccountId) return resolved;

  const db = getAdminDb();
  await Promise.all(
    unique.filter(isWellFormedFormId).map(async (formId) => {
      const snap = await db.collection("forms").doc(formId).get();
      if (!snap.exists) return;
      const data = snap.data() as Omit<LeadForm, "id">;
      if (data.subAccountId !== subAccountId) return;
      resolved[formId] = { ...data, id: snap.id, createdAt: null, updatedAt: null };
    }),
  );
  return resolved;
}

/** The owning sub-account of a page, read server-side; null when the page doesn't exist. */
export async function pageSubAccountId(pageId: string): Promise<string | null> {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(pageId)) return null;
  const snap = await getAdminDb().collection("pages").doc(pageId).get();
  const subAccountId = snap.exists ? snap.get("subAccountId") : null;
  return typeof subAccountId === "string" && subAccountId ? subAccountId : null;
}
