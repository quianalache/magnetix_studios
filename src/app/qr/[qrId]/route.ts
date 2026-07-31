import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";

export const dynamic = "force-dynamic";

/**
 * Public QR redirect. A printed Link-kind QR code encodes THIS url, not the
 * real destination, so the destination can change later without reprinting
 * (the whole point of a "dynamic" QR, matching GoHighLevel's tool). No HMAC
 * token — an unguessable Firestore doc id is the same trust model as every
 * other public short-link slug in this app (/f, /b, /e, /q).
 */

function deadLink(message: string): NextResponse {
  return new NextResponse(
    `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>QR code</title></head>
<body style="font-family:system-ui,-apple-system,sans-serif;display:flex;min-height:100vh;align-items:center;justify-content:center;background:#fafafa;color:#18181b;">
<div style="max-width:420px;padding:32px;text-align:center;">
<h1 style="font-size:20px;margin:0 0 8px;">This QR code isn't set up</h1>
<p style="color:#52525b;font-size:14px;line-height:1.6;">${message}</p>
</div></body></html>`,
    { status: 404, headers: { "content-type": "text/html; charset=utf-8" } },
  );
}

export async function GET(
  _request: Request,
  ctx: { params: Promise<{ qrId: string }> },
) {
  const { qrId } = await ctx.params;
  const db = getAdminDb();
  const ref = db.doc(`qrCodes/${qrId}`);
  const snap = await ref.get();
  if (!snap.exists) {
    return deadLink("This code doesn't match anything on file.");
  }
  const data = snap.data() as {
    kind?: string;
    destinationUrl?: string | null;
  };
  if (data.kind !== "link" || !data.destinationUrl) {
    return deadLink("No destination has been set for this code yet.");
  }

  // Fire-and-forget — never block the redirect on the counter write.
  void ref.update({ scanCount: FieldValue.increment(1) }).catch(() => {});

  return NextResponse.redirect(data.destinationUrl, 302);
}
