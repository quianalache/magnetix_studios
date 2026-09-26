import "server-only";

import { getAdminDb } from "@/lib/firebase/admin";
import { resolveAuthorNames } from "@/lib/server/contact-route-guard";
import type { ContactActivityItem } from "@/types/contact-feed";
import type { Deal } from "@/types/deals";

/**
 * Deal Details → Activity (Multiple Pipelines, 2026-09-25).
 *
 * Only events RELIABLY associated with this deal:
 *   1. `deals/{id}/activities` — the deal's own feed (written by the deal
 *      service for create / stage / pipeline moves, and by linked-record
 *      writers going forward).
 *   2. Older rows on the contact timeline that carry `meta.dealId` (every
 *      `pipeline_moved` row since deals existed). Rows mirrored into (1)
 *      carry `mirrorOf` = that contact activity id and are skipped here, so
 *      nothing appears twice. Historical rows are only READ, never changed.
 *   3. Content-free "Note added" markers synthesized from deal-note
 *      metadata (same convention as the Contact Activity tab) — the note
 *      text itself lives only in the Notes tab.
 *
 * Contact activity that isn't tagged with this deal (emails, SMS, other
 * deals) is deliberately NOT included.
 */

const SOURCE_LIMIT = 200;
export const DEAL_ACTIVITY_LIMIT = 100;

function toIso(v: unknown): string | null {
  const t = v as { toDate?: () => Date } | null;
  return t && typeof t.toDate === "function" ? t.toDate().toISOString() : null;
}

export async function listDealActivity(deal: Deal): Promise<{
  items: ContactActivityItem[];
  truncated: boolean;
}> {
  const db = getAdminDb();
  const [own, legacy, notes] = await Promise.all([
    db
      .collection(`deals/${deal.id}/activities`)
      .orderBy("createdAt", "desc")
      .limit(SOURCE_LIMIT)
      .get(),
    deal.contactId
      ? db
          .collection(`contacts/${deal.contactId}/activities`)
          .where("meta.dealId", "==", deal.id)
          .limit(SOURCE_LIMIT)
          .get()
      : null,
    db
      .collection(`deals/${deal.id}/notes`)
      .orderBy("createdAt", "desc")
      .limit(SOURCE_LIMIT)
      .select("createdAt", "createdBy")
      .get(),
  ]);

  const mirrored = new Set(
    own.docs.map((d) => d.get("mirrorOf")).filter((v): v is string => !!v),
  );
  const items: ContactActivityItem[] = [];
  const push = (
    id: string,
    kind: ContactActivityItem["kind"],
    data: FirebaseFirestore.DocumentData,
  ) => {
    const createdAt = toIso(data.createdAt);
    if (!createdAt) return;
    items.push({
      id,
      kind,
      type: kind === "note" ? "note_added" : String(data.type ?? "note"),
      content: kind === "note" ? "" : String(data.content ?? ""),
      createdAt,
      createdBy: String(data.createdBy ?? ""),
      actorName: null,
      meta:
        kind === "note"
          ? null
          : ((data.meta as Record<string, unknown> | undefined) ?? null),
    });
  };
  for (const d of own.docs) push(`deal:${d.id}`, "activity", d.data());
  for (const d of legacy?.docs ?? []) {
    if (!mirrored.has(d.id)) push(`contact:${d.id}`, "activity", d.data());
  }
  for (const d of notes.docs) push(`note:${d.id}`, "note", d.data());

  items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const page = items.slice(0, DEAL_ACTIVITY_LIMIT);
  const authors = await resolveAuthorNames(
    deal.subAccountId,
    page.map((i) => i.createdBy).filter(Boolean),
  );
  for (const i of page) i.actorName = authors.get(i.createdBy)?.name ?? null;
  return { items: page, truncated: items.length > DEAL_ACTIVITY_LIMIT };
}

export function dealNotesPath(dealId: string): string {
  return `deals/${dealId}/notes`;
}
