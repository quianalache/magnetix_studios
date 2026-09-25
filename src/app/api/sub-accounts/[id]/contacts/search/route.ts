import "server-only";

import { NextResponse } from "next/server";
import { requireSubAccountMember } from "@/lib/auth/require-tenancy";
import { loadEffectiveTerritoryScope } from "@/lib/auth/territory-filter";
import {
  matchContacts,
  normalizeSort,
  paginate,
  toContactRow,
} from "@/lib/server/contacts-query-service";
import { getContactList } from "@/lib/server/contact-lists-service";
import { sanitizeConditionGroup } from "@/lib/segmentation/sanitize-group";
import {
  CONTACTS_PAGE_SIZE,
  type ContactSearchResponse,
} from "@/types/contact-search";
import type { ConditionGroup } from "@/types/workflows";

export const dynamic = "force-dynamic";

/**
 * Contacts list — one server-evaluated page (Contacts redesign,
 * 2026-09-25). Body: `ContactSearchRequest`. Any active member; a
 * territory-scoped collaborator only ever sees their territories' contacts
 * (same scope the old client listener + Firestore rules enforced).
 */
export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: subAccountId } = await ctx.params;
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const groups: ConditionGroup[] = [];
  const adHoc = sanitizeConditionGroup(body.group);
  if (!adHoc.ok) return NextResponse.json({ error: adHoc.error }, { status: 400 });
  groups.push(adHoc.group);

  if (typeof body.listId === "string" && body.listId) {
    const list = await getContactList(subAccountId, body.listId);
    if (!list) {
      return NextResponse.json({ error: "Contact List not found." }, { status: 404 });
    }
    groups.push(list.group);
  }

  const scope = await loadEffectiveTerritoryScope(access);
  const { matched, visibleTotal } = await matchContacts({
    subAccountId,
    territoryIds: scope.enforce ? (scope.ids ?? []) : null,
    search: typeof body.search === "string" ? body.search.slice(0, 200) : "",
    groups,
    sort: normalizeSort(body.sort),
    fresh: body.fresh === true,
  });

  const { slice, page, pageCount } = paginate(
    matched,
    typeof body.page === "number" ? body.page : 1,
  );
  const res: ContactSearchResponse = {
    contacts: slice.map(toContactRow),
    total: matched.length,
    visibleTotal,
    page,
    pageSize: CONTACTS_PAGE_SIZE,
    pageCount,
  };
  return NextResponse.json(res);
}
