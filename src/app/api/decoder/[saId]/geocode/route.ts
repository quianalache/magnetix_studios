import "server-only";

import { NextResponse } from "next/server";
import { searchBirthPlaces } from "@/lib/energetics/geocode";

export const dynamic = "force-dynamic";

/** Public place-search for the embeddable tool's birth-place autocomplete — no session. */
export async function GET(request: Request) {
  const q = new URL(request.url).searchParams.get("q") ?? "";
  const results = await searchBirthPlaces(q);
  return NextResponse.json({ ok: true, results });
}
