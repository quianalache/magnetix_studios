import "server-only";

import { NextResponse } from "next/server";
import { requireAgencyOwnerAny } from "@/lib/auth/require-tenancy";
import { emailIsConfigured, sendEmail } from "@/lib/comms/resend";
import { buildAgencyUnsubscribeUrl } from "@/lib/automations/agency-unsubscribe-token";
import { buildListUnsubscribeHeaders } from "@/lib/broadcasts/compliance";
import { renderBroadcastEmailHtml, renderBroadcastEmailText } from "@/lib/broadcasts/render-email";
import { resolveCustomBrand } from "@/lib/landing/resolve-brand";
import type { BroadcastContent } from "@/types/broadcast-content";

export const dynamic = "force-dynamic";

interface TestSendBody {
  content?: BroadcastContent;
  subject?: string;
  preheader?: string | null;
  testEmail?: string;
}

/**
 * Agency Communications Test Send — the agency-scope sibling of
 * /api/broadcasts/email/test-send. Same contract: exact rendered content,
 * one operator-chosen address, no communication doc, no `sends` row, no
 * totals touched. Uses the shared platform sender (`sendEmail`, never
 * `sendTenantEmail`) and Magnetix Studios' own brand — see
 * agency-communications-service.ts's module comment.
 */
export async function POST(request: Request) {
  if (!emailIsConfigured()) {
    return NextResponse.json({ error: "Email is not configured on this deployment." }, { status: 503 });
  }

  const caller = await requireAgencyOwnerAny(request);
  if (caller instanceof NextResponse) return caller;

  let payload: TestSendBody;
  try {
    payload = (await request.json()) as TestSendBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const content = payload.content;
  const subject = payload.subject?.trim();
  const testEmail = payload.testEmail?.trim();

  if (!content || !subject || !testEmail) {
    return NextResponse.json({ error: "content, subject, and testEmail are required" }, { status: 400 });
  }
  if (!testEmail.includes("@")) {
    return NextResponse.json({ error: "testEmail is not a valid address" }, { status: 400 });
  }
  if (!Array.isArray(content.blocks) || content.blocks.length === 0) {
    return NextResponse.json({ error: "content must have at least one block" }, { status: 400 });
  }

  const brand = await resolveCustomBrand();
  // Synthetic address — can never resolve to a real recipient's
  // preferences, matching tenant test-send's own "test-send" contactId
  // convention (see that route's doc comment).
  const unsubscribeLink = buildAgencyUnsubscribeUrl("test-send@magnetix.invalid");
  const renderOpts = { unsubscribeUrl: unsubscribeLink, mailingAddress: "", businessName: brand.name };
  const html = renderBroadcastEmailHtml(content, renderOpts, subject, payload.preheader ?? null);
  const text = renderBroadcastEmailText(content, renderOpts, subject, payload.preheader ?? null);

  const rawFrom = process.env.EMAIL_FROM ?? "";
  const mailtoMatch = rawFrom.match(/<([^>]+)>/);
  const mailto = mailtoMatch ? mailtoMatch[1] : rawFrom;
  const unsubscribeHeaders = mailto ? buildListUnsubscribeHeaders(unsubscribeLink, mailto) : undefined;

  try {
    const result = await sendEmail({
      to: testEmail,
      subject: `[TEST] ${subject || "(no subject)"}`,
      text,
      html,
      headers: unsubscribeHeaders,
    });
    return NextResponse.json({ ok: true, resendMessageId: result.id });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Test send failed." }, { status: 502 });
  }
}
