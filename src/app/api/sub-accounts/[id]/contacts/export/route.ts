import "server-only";

import { NextResponse } from "next/server";
import { requireSubAccountMember } from "@/lib/auth/require-tenancy";
import { loadEffectiveTerritoryScope } from "@/lib/auth/territory-filter";
import {
  EXPORT_MAX_ROWS,
  matchContacts,
  normalizeSort,
  toContactRow,
} from "@/lib/server/contacts-query-service";
import { getContactList } from "@/lib/server/contact-lists-service";
import { sanitizeConditionGroup } from "@/lib/segmentation/sanitize-group";
import type { ConditionGroup } from "@/types/workflows";

export const dynamic = "force-dynamic";

/**
 * Contacts export (Contacts redesign, 2026-09-25) — every contact matching
 * the current search + filters (+ optional Contact List), as rows the
 * browser serializes with the existing CSV helper. Same auth + territory
 * scope as /contacts/search. Capped at EXPORT_MAX_ROWS.
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
  const { matched } = await matchContacts({
    subAccountId,
    territoryIds: scope.enforce ? (scope.ids ?? []) : null,
    search: typeof body.search === "string" ? body.search.slice(0, 200) : "",
    groups,
    sort: normalizeSort(body.sort),
    fresh: true,
  });
  if (matched.length > EXPORT_MAX_ROWS) {
    return NextResponse.json(
      {
        error: `That's ${matched.length} contacts — exports are capped at ${EXPORT_MAX_ROWS}. Narrow the filters and try again.`,
      },
      { status: 400 },
    );
  }
  return NextResponse.json({ contacts: matched.map(toContactRow) });
}
