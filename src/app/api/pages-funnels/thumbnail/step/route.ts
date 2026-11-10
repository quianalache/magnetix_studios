import "server-only";

import { NextResponse } from "next/server";
import { qstashIsConfigured, verifyQStashSignature } from "@/lib/automations/qstash";
import { capturePageThumbnail } from "@/lib/server/pages-funnels/page-thumbnail-service";

export const dynamic = "force-dynamic";
// Cold start downloads the Chromium pack (~10–20 s) before the ~5 s capture.
export const maxDuration = 90;

/**
 * QStash callback: capture one page's thumbnail (Pages & Funnels home,
 * 2026-11). Public path — security is the Upstash-Signature check. The page
 * id is the only input; which version to capture is re-derived from the page
 * record, so a duplicate or stale message just reports "current". A failed
 * capture returns 200 (recorded in logs; the library retries it later under
 * its 15-minute throttle) so QStash never retry-storms a broken page.
 */
export async function POST(request: Request) {
  if (!qstashIsConfigured()) return NextResponse.json({ error: "QStash is not configured on this deployment." }, { status: 503 });
  const signature = request.headers.get("upstash-signature");
  if (!signature) return NextResponse.json({ error: "Missing Upstash-Signature header" }, { status: 401 });
  const raw = await request.text();
  if (!(await verifyQStashSignature(signature, raw))) return NextResponse.json({ error: "Invalid signature" }, { status: 401 });

  let pageId: unknown;
  try {
    pageId = (JSON.parse(raw) as { pageId?: unknown }).pageId;
  } catch {
    return NextResponse.json({ ok: false, reason: "bad_body" });
  }
  if (typeof pageId !== "string") return NextResponse.json({ ok: false, reason: "bad_body" });
  const outcome = await capturePageThumbnail(pageId);
  return NextResponse.json({ ok: outcome.status !== "failed", status: outcome.status, ...(outcome.status !== "captured" ? { reason: outcome.reason } : {}) });
}
