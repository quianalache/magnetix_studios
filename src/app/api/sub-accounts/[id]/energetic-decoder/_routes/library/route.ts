import "server-only";

import { NextResponse } from "next/server";
import { requireSubAccountMember } from "@/lib/auth/require-tenancy";
import { listReadingsLibrary } from "@/lib/server/readings-library-service";
import { normalizeLibraryPage, normalizeLibrarySort } from "@/lib/energetic-decoder/readings-library";

/**
 * Readings library (2026-10-07) — one page of Energetic Decoder → Readings.
 * `?q=` searches the person's name and their Contact's name only (never
 * birth place); `?sort=recent|name_asc|name_desc`; `?page=` (25 per page).
 */
export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id: subAccountId } = await ctx.params;
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;

  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").slice(0, 100);
  const result = await listReadingsLibrary(subAccountId, {
    q,
    sort: normalizeLibrarySort(url.searchParams.get("sort")),
    page: normalizeLibraryPage(url.searchParams.get("page")),
  });
  return NextResponse.json({ ok: true, ...result });
}
