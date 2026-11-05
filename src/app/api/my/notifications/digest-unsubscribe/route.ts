import { NextResponse } from "next/server";
import { verifyDigestUnsubscribeToken } from "@/lib/server/community-digest-service";
import { unsubscribeMemberFromDigest } from "@/lib/server/community-notification-prefs";

export const dynamic = "force-dynamic";

function page(title: string, body: string, status = 200): Response {
  return new Response(
    `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title></head><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f7f5f9;color:#2a2230;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0;padding:16px;"><div style="max-width:420px;background:#fff;border:1px solid #ece6f1;border-radius:14px;padding:28px;">${body}</div></body></html>`,
    { status, headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
}

/** GET: confirm page (link scanners don't unsubscribe anyone). */
export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("t") ?? "";
  if (!verifyDigestUnsubscribeToken(token)) return page("Link not valid", "<h1 style=\"font-size:18px;margin:0 0 8px;\">This link isn't valid</h1><p>Manage your notifications from MyMagnetix → Settings.</p>", 400);
  return page(
    "Unsubscribe from digest",
    `<h1 style="font-size:18px;margin:0 0 8px;">Stop the community digest?</h1><p style="margin:0 0 18px;">You'll still get notifications you've turned on.</p><form method="post"><input type="hidden" name="t" value="${token.replace(/"/g, "&quot;")}"><button type="submit" style="background:#3d1650;color:#fff;border:0;border-radius:10px;padding:12px 18px;font-weight:600;cursor:pointer;">Unsubscribe</button></form>`
  );
}

/** POST: the form above, or a mail client's RFC 8058 one-click request. */
export async function POST(request: Request) {
  const url = new URL(request.url);
  let token = url.searchParams.get("t") ?? "";
  if (!token) {
    const form = await request.formData().catch(() => null);
    token = String(form?.get("t") ?? "");
  }
  const parsed = verifyDigestUnsubscribeToken(token);
  if (!parsed) return page("Link not valid", "<p>This link isn't valid.</p>", 400);
  await unsubscribeMemberFromDigest(parsed.personId, parsed.subAccountId, parsed.groupId);
  return page("Unsubscribed", "<h1 style=\"font-size:18px;margin:0 0 8px;\">You're unsubscribed</h1><p>You won't get this community's digest anymore. You can turn it back on in MyMagnetix → Settings.</p>");
}
