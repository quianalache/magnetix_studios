import "server-only";

import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireSubAccountMember } from "@/lib/auth/require-tenancy";
import { buildUnsubscribeUrl } from "@/lib/automations/unsubscribe-token";
import { formatMailingAddress } from "@/lib/broadcasts/compliance";
import {
  renderBroadcastEmailHtml,
  renderBroadcastEmailText,
} from "@/lib/broadcasts/render-email";
import type { BroadcastContent, SubAccountDoc } from "@/types";

export const dynamic = "force-dynamic";

interface RenderBody {
  subAccountId?: string;
  content?: BroadcastContent;
}

/**
 * Composer preview endpoint — returns the SAME HTML/text the real send would
 * produce. The composer's iframe renders this response directly (debounced
 * on every edit), so preview and send are byte-for-byte the same renderer
 * call, never a second approximate WYSIWYG render.
 *
 * Uses a harmless synthetic unsubscribe token (contactId "preview" — doesn't
 * correspond to a real contact) and, when the sub-account has no mailing
 * address yet, a visible placeholder string rather than silently omitting
 * the footer — the gap should be obvious in preview, not hidden.
 */
export async function POST(request: Request) {
  let payload: RenderBody;
  try {
    payload = (await request.json()) as RenderBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const subAccountId = payload.subAccountId?.trim();
  const content = payload.content;
  if (!subAccountId || !content) {
    return NextResponse.json(
      { error: "subAccountId and content are required" },
      { status: 400 },
    );
  }

  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;

  const subSnap = await getAdminDb().doc(`subAccounts/${subAccountId}`).get();
  const subAccount = subSnap.exists ? (subSnap.data() as SubAccountDoc) : null;

  const unsubscribeUrl = buildUnsubscribeUrl("preview");
  const mailingAddress = subAccount?.mailingAddress
    ? formatMailingAddress(subAccount.mailingAddress)
    : "[Add your business mailing address in Settings → Sending preferences]";
  const businessName = subAccount?.name ?? "";

  const opts = { unsubscribeUrl, mailingAddress, businessName };
  const html = renderBroadcastEmailHtml(content, opts);
  const text = renderBroadcastEmailText(content, opts);

  return NextResponse.json({ html, text });
}
