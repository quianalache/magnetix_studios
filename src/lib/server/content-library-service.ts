import "server-only";

import { getAdminDb } from "@/lib/firebase/admin";
import type { ContentItemDoc, ContentTemplateDoc } from "@/types/content-library";

const CONTENT_ITEMS = "contentItems";
const CONTENT_TEMPLATES = "contentTemplates";

/**
 * Server-verified read of a sub-account's Content Library — 2026-08-30
 * CRM-wide stability pass. Mirrors `subscribeToContentItems`/
 * `subscribeToContentTemplates`'s own client-side query exactly (same
 * collection, same `subAccountId` filter, same sort), just via the Admin
 * SDK instead of the client Firestore listener that page previously
 * depended on with no fallback — see `/api/sub-accounts/[id]/content`'s
 * own doc comment for why that mattered here specifically.
 */
export async function listContentItemsForSubAccount(
  subAccountId: string,
): Promise<ContentItemDoc[]> {
  const snap = await getAdminDb()
    .collection(CONTENT_ITEMS)
    .where("subAccountId", "==", subAccountId)
    .get();
  const items = snap.docs.map(
    (d) => ({ id: d.id, ...(d.data() as Omit<ContentItemDoc, "id">) }),
  );
  items.sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
  return items;
}

export async function listContentTemplatesForSubAccount(
  subAccountId: string,
): Promise<ContentTemplateDoc[]> {
  const snap = await getAdminDb()
    .collection(CONTENT_TEMPLATES)
    .where("subAccountId", "==", subAccountId)
    .get();
  const templates = snap.docs.map(
    (d) => ({ id: d.id, ...(d.data() as Omit<ContentTemplateDoc, "id">) }),
  );
  templates.sort((a, b) => {
    if (a.isSystem !== b.isSystem) return a.isSystem ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  return templates;
}

function toMillis(v: unknown): number {
  if (!v) return 0;
  const maybe = v as { toMillis?: () => number; seconds?: number };
  if (typeof maybe.toMillis === "function") return maybe.toMillis();
  if (typeof maybe.seconds === "number") return maybe.seconds * 1000;
  return 0;
}
