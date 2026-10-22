import "server-only";

import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireSubAccountMember } from "@/lib/auth/require-tenancy";
import { getEmbedConfig } from "@/lib/server/embed-config-service";
import { submitPublicReading, type PublicReadingMode } from "@/lib/server/public-reading-service";
import { normalizeAttribution } from "@/lib/attribution";
import { checkMemberAuthRateLimit } from "@/lib/community/member-rate-limit";
import type { ReadingPlacement } from "@/types/embed-config";
import type { ContactAttribution } from "@/types/contacts";

export const dynamic = "force-dynamic";

/**
 * The Public Reading Tool's submit endpoint (Phase 1, 2026-10-19). No
 * session for visitors (mirrors /api/offer/[saId]/[offerId]/signup) and it
 * never signs anyone in. With `embedId` the submission follows that Embed's
 * configured journey; without one it's the original Embed-less tool.
 *
 * `mode: "test" | "preview"` are staff rehearsals — they require a signed-in
 * member of this sub-account and always use that staff member's own email.
 * Live submissions only reach a Live Embed (Draft/Archived fail closed).
 */

interface SubmitBody {
  embedId?: unknown;
  mode?: unknown;
  name?: unknown;
  email?: unknown;
  phone?: unknown;
  consent?: unknown;
  birthDate?: unknown;
  birthTime?: unknown;
  birthPlace?: unknown;
  lat?: unknown;
  lng?: unknown;
  timeZone?: unknown;
  placement?: { kind?: unknown; pageId?: unknown; host?: unknown };
  attribution?: Partial<ContactAttribution>;
}

const str = (v: unknown, max = 200) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);

export async function POST(request: Request, { params }: { params: Promise<{ saId: string }> }) {
  const { saId } = await params;
  const db = getAdminDb();
  const subSnap = await db.doc(`subAccounts/${saId}`).get();
  if (!subSnap.exists || subSnap.data()?.status === "archived") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const agencyId = subSnap.data()?.agencyId as string | undefined;
  if (!agencyId) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let body: SubmitBody;
  try {
    body = (await request.json()) as SubmitBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const mode: PublicReadingMode = body.mode === "test" || body.mode === "preview" ? body.mode : "live";
  let staffEmail: string | null = null;
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
  if (mode !== "live") {
    const access = await requireSubAccountMember(request, saId);
    if (access instanceof NextResponse) return NextResponse.json({ error: "Not found" }, { status: 404 });
    staffEmail = access.email || null;
    if (!staffEmail) return NextResponse.json({ error: "Your staff account has no email on file." }, { status: 400 });
  } else {
    const allowed = checkMemberAuthRateLimit({ key: `reading-tool:${saId}:${ip ?? "unknown"}`, limit: 12, windowMs: 10 * 60 * 1000 });
    if (!allowed) return NextResponse.json({ error: "Too many readings from this connection. Try again in a few minutes." }, { status: 429 });
  }

  const embedId = str(body.embedId, 64);
  const embed = embedId ? await getEmbedConfig(saId, embedId) : null;
  if (embedId && !embed) return NextResponse.json({ error: "Not found" }, { status: 404 });
  // Draft and Archived Embeds are not publicly usable; staff Preview/Test still work.
  if (embed && mode === "live" && embed.status !== "live") {
    return NextResponse.json({ error: "This reading tool isn’t available right now." }, { status: 404 });
  }

  // Placement: a page must belong to this business; an external host is a
  // label only (the install script reports the host page's hostname).
  let placement: ReadingPlacement | null = { kind: "direct" };
  if (body.placement?.kind === "page") {
    const pageId = str(body.placement.pageId, 64);
    const page = pageId ? await db.collection("pages").doc(pageId).get() : null;
    placement = page?.exists && page.get("subAccountId") === saId ? { kind: "page", pageId } : { kind: "direct" };
  } else if (body.placement?.kind === "external") {
    const host = str(body.placement.host, 120).toLowerCase();
    placement = { kind: "external", host: /^[a-z0-9.-]+$/.test(host) ? host : null };
  }

  const result = await submitPublicReading({
    subAccountId: saId,
    agencyId,
    embed,
    mode,
    staffEmail,
    name: str(body.name),
    email: str(body.email, 254),
    phone: str(body.phone, 40),
    consent: body.consent === true,
    birthDate: str(body.birthDate, 20),
    birthTime: str(body.birthTime, 20),
    birthPlace: str(body.birthPlace, 300),
    lat: num(body.lat),
    lng: num(body.lng),
    timeZone: str(body.timeZone, 80) || undefined,
    placement,
    attribution: normalizeAttribution(body.attribution),
    ip,
  });

  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({
    ok: true,
    reading: result.reading,
    links: result.links,
    pass: result.pass,
    myMagnetix: result.myMagnetix,
    redirect: result.redirect,
    previewPageId: result.previewPageId,
    email: result.email,
    mode,
  });
}
