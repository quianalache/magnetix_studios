import "server-only";

import { NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { requireSubAccountMember } from "@/lib/auth/require-tenancy";
import { emailIsConfigured, sendTenantEmail } from "@/lib/comms/resend";
import { buildUnsubscribeUrl } from "@/lib/automations/unsubscribe-token";
import {
  requireMailingAddress,
  MissingMailingAddressError,
  formatMailingAddress,
  buildBroadcastUnsubscribeHeaders,
} from "@/lib/broadcasts/compliance";
import {
  renderBroadcastEmailHtml,
  renderBroadcastEmailText,
} from "@/lib/broadcasts/render-email";
import type { BroadcastContent, SubAccountDoc } from "@/types";

export const dynamic = "force-dynamic";

interface TestSendBody {
  subAccountId?: string;
  content?: BroadcastContent;
  subject?: string;
  preheader?: string | null;
  testEmail?: string;
}

/**
 * Production safety control (2026-08-26) — a real Test Send path, separate
 * from Broadcast Test Mode. Sends the EXACT rendered broadcast (same
 * renderer, same sender domain as a live send) to exactly one operator-
 * chosen address. Deliberately creates NO `broadcasts/{id}` doc and writes
 * no `sends` row — this must never appear in broadcast history or move any
 * totals, so an operator previewing a send can't accidentally pollute
 * analytics or be mistaken for a real audience send later.
 *
 * Unlike a real broadcast, this does not check `emailOptedOut` /
 * `deliverabilitySuppressed` — the operator is directly, knowingly typing
 * the destination address themselves (this is not audience resolution),
 * so there's no "did we respect someone's marketing preference" question
 * to answer. The unsubscribe link uses a synthetic contactId ("test-send")
 * that can never resolve to a real contact — if a test recipient clicks it,
 * /api/u/[token] 404s cleanly rather than ever touching a real Contact.
 */
export async function POST(request: Request) {
  if (!emailIsConfigured()) {
    return NextResponse.json(
      { error: "Email is not configured on this deployment." },
      { status: 503 },
    );
  }

  let payload: TestSendBody;
  try {
    payload = (await request.json()) as TestSendBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const subAccountId = payload.subAccountId?.trim();
  const content = payload.content;
  const subject = payload.subject?.trim();
  // preheader isn't wired into renderBroadcastEmailHtml/Text by the real
  // send path either (see step/route.ts) — accepted here only so the
  // composer's request shape matches /email/send's, not currently rendered.
  const testEmail = payload.testEmail?.trim();

  if (!subAccountId || !content || !subject || !testEmail) {
    return NextResponse.json(
      { error: "subAccountId, content, subject, and testEmail are required" },
      { status: 400 },
    );
  }
  if (!testEmail.includes("@")) {
    return NextResponse.json({ error: "testEmail is not a valid address" }, { status: 400 });
  }
  if (!Array.isArray(content.blocks) || content.blocks.length === 0) {
    return NextResponse.json(
      { error: "content must have at least one block" },
      { status: 400 },
    );
  }

  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;

  const db = getAdminDb();
  const subSnap = await db.doc(`subAccounts/${subAccountId}`).get();
  if (!subSnap.exists) {
    return NextResponse.json({ error: "Sub-account not found" }, { status: 404 });
  }
  const subAccount = { id: subSnap.id, ...(subSnap.data() as Omit<SubAccountDoc, "id">) };

  if (subAccount.broadcastsEnabledByAgency !== true) {
    return NextResponse.json(
      {
        error:
          "Broadcasts are disabled for this sub-account. Your agency administrator can enable them from Manage in the agency sub-accounts list.",
      },
      { status: 403 },
    );
  }

  try {
    requireMailingAddress(subAccount);
  } catch (err) {
    if (err instanceof MissingMailingAddressError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    throw err;
  }
  const formattedAddress = formatMailingAddress(subAccount.mailingAddress!);

  const unsubscribeLink = buildUnsubscribeUrl("test-send");
  const renderOpts = {
    unsubscribeUrl: unsubscribeLink,
    mailingAddress: formattedAddress,
    businessName: subAccount.name ?? "",
  };
  const html = renderBroadcastEmailHtml(content, renderOpts);
  const text = renderBroadcastEmailText(content, renderOpts);
  const unsubscribeHeaders = buildBroadcastUnsubscribeHeaders(subAccount, unsubscribeLink);

  try {
    const result = await sendTenantEmail({
      sub: subAccount,
      to: testEmail,
      subject: `[TEST] ${subject || "(no subject)"}`,
      text,
      html,
      headers: unsubscribeHeaders,
    });
    return NextResponse.json({ ok: true, resendMessageId: result.id });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Test send failed." },
      { status: 502 },
    );
  }
}
