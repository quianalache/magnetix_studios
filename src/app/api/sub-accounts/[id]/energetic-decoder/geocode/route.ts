import "server-only";

import { NextResponse } from "next/server";
import { requireSubAccountMember } from "@/lib/auth/require-tenancy";
import { searchBirthPlaces } from "@/lib/energetics/geocode";

/**
 * Live place-search for the birth-place autocomplete dropdown. Same free
 * Nominatim API `geocodeBirthPlace` uses, just returning several
 * candidates instead of the top match — the frontend debounces calls to
 * stay well within Nominatim's fair-use rate limit.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: subAccountId } = await params;
  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;

  const q = new URL(request.url).searchParams.get("q") ?? "";
  const results = await searchBirthPlaces(q);
  return NextResponse.json({ ok: true, results });
}
