import "server-only";

import { NextResponse } from "next/server";
import { searchBirthPlaces } from "@/lib/energetics/geocode";

export const dynamic = "force-dynamic";

const WINDOW_MS = 60_000;
const MAX_REQUESTS = 20;
const requestWindows = new Map<string, { startedAt: number; count: number }>();

/** Public place-search for the embeddable tool's birth-place autocomplete — no session. */
export async function GET(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const key = forwarded || request.headers.get("x-real-ip") || "anonymous";
  const now = Date.now();
  const current = requestWindows.get(key);
  if (!current || now - current.startedAt >= WINDOW_MS) {
    requestWindows.set(key, { startedAt: now, count: 1 });
  } else {
    current.count += 1;
    if (current.count > MAX_REQUESTS) {
      return NextResponse.json({ error: "Please wait before searching again." }, { status: 429 });
    }
  }
  const q = new URL(request.url).searchParams.get("q") ?? "";
  const results = await searchBirthPlaces(q);
  return NextResponse.json({ ok: true, results });
}
