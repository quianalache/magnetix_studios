import "server-only";

import { NextResponse } from "next/server";
import { requireSubAccountAdmin } from "@/lib/auth/require-tenancy";
import { importedContentOrigin } from "@/lib/pages-funnels/imported-site/policy";
import { ImportedSiteError, addSiteFile, createSiteFromHtml, editSiteEntry, finishSiteBundle, startSiteBundle } from "@/lib/server/pages-funnels/imported-site-service";

/**
 * Imported websites (2026-11-20) — workspace admins only. One static route
 * (no dynamic segment, so no Vercel route cost): `action` = start | file |
 * finish | html | edit. Refused entirely unless the separate content origin
 * is configured (interactive imports OFF otherwise).
 */
export const maxDuration = 60;

export async function POST(request: Request) {
  if (!importedContentOrigin()) {
    return NextResponse.json({ error: "Interactive website imports aren't switched on for this deployment." }, { status: 409 });
  }
  let body: Record<string, unknown>;
  try {
    const parsed = await request.json();
    body = parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const sa = typeof body.subAccountId === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(body.subAccountId) ? body.subAccountId : "";
  if (!sa) return NextResponse.json({ error: "Missing workspace" }, { status: 400 });
  const access = await requireSubAccountAdmin(request, sa);
  if (access instanceof NextResponse) return access;
  const bundleId = typeof body.bundleId === "string" ? body.bundleId : "";
  try {
    switch (body.action) {
      case "start":
        return NextResponse.json(await startSiteBundle({ subAccountId: sa, uid: access.uid }));
      case "file":
        return NextResponse.json(await addSiteFile({ subAccountId: sa, uid: access.uid, bundleId, path: body.path, base64: body.base64 }));
      case "finish": {
        const r = await finishSiteBundle({ subAccountId: sa, uid: access.uid, bundleId });
        return NextResponse.json({ site: r.ref, missing: r.missing, invalidForms: r.invalidForms });
      }
      case "html": {
        if (typeof body.html !== "string" || !body.html.trim() || body.html.length > 2_000_000) return NextResponse.json({ error: "Paste the page's HTML." }, { status: 400 });
        const r = await createSiteFromHtml({ subAccountId: sa, uid: access.uid, html: body.html });
        return NextResponse.json({ site: r.ref, missing: r.missing, invalidForms: r.invalidForms });
      }
      case "edit": {
        const r = await editSiteEntry({ subAccountId: sa, uid: access.uid, bundleId, html: body.html });
        return NextResponse.json({ site: r.ref, missing: r.missing, invalidForms: r.invalidForms });
      }
      default:
        return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }
  } catch (err) {
    if (err instanceof ImportedSiteError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error("[imported-site]", err);
    return NextResponse.json({ error: "Couldn't process the website upload." }, { status: 500 });
  }
}
