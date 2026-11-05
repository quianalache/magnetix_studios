import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { sendTenantEmail } from "@/lib/comms/resend";
import { createPersonPasswordToken } from "@/lib/server/person-password";
import { ensurePersonLinkForMember } from "@/lib/server/person-identity-service";
import type { Member } from "@/types/community";

/**
 * Community member activation email (2026-11-05, Magnetic Visibility Circle).
 *
 * A transactional, per-member system email — not a Broadcast (broadcasts
 * can't mint a per-recipient secret link) and not a Workflow (no community
 * trigger exists, and this is a one-off owner action). For each active
 * member of one community it:
 *   1. links the Member to its MyMagnetix Person by email — the existing
 *      canonical rule (`ensurePersonLinkForMember`), so no duplicate Person,
 *      Member or Contact is ever created;
 *   2. skips anyone whose Person already has a MyMagnetix password;
 *   3. mints a single-use MyMagnetix set-password token (only its SHA-256
 *      digest is stored) that expires in 7 days and carries a server-chosen
 *      destination: the member's community through the `/api/my/enter`
 *      bridge;
 *   4. sends from the workspace's verified sending domain.
 * A per-member ledger doc (`activationEmails/{campaign}__{memberId}`,
 * created with `create()`) makes a second send for the same campaign
 * impossible. Raw tokens are never logged or stored.
 */

export const COMMUNITY_ACTIVATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type ActivationState =
  | "needs_activation"
  | "already_active"
  | "already_sent"
  | "invalid_email"
  | "inactive_member"
  | "unverified_member"
  | "excluded";

export interface ActivationRecipient {
  memberId: string;
  email: string;
  firstName: string;
  state: ActivationState;
  reason?: string;
}

export interface ActivationCampaign {
  subAccountId: string;
  groupId: string;
  /** Stable id for duplicate protection, e.g. "mvc-activation-2026-11". */
  campaign: string;
  /** Name shown in the email ("Magnetic Visibility Circle"). */
  communityName: string;
  /** Emails never sent to (e.g. the owner's own accounts). Lower-cased. */
  excludeEmails?: string[];
}

function ledgerRef(c: ActivationCampaign, memberId: string) {
  return getAdminDb().doc(
    `subAccounts/${c.subAccountId}/communityGroups/${c.groupId}/activationEmails/${c.campaign}__${memberId}`
  );
}

export function firstNameOf(displayName: string | null | undefined): string {
  const first = (displayName ?? "").trim().split(/\s+/)[0] ?? "";
  return first || "there";
}

async function personHasPassword(personId: string | null | undefined, email: string): Promise<boolean> {
  const db = getAdminDb();
  if (personId) {
    const snap = await db.doc(`people/${personId}`).get();
    if (snap.exists) return !!snap.data()?.passwordHash;
  }
  const byEmail = await db.collection("people").where("primaryEmail", "==", email).limit(1).get();
  return !byEmail.empty && !!byEmail.docs[0].data().passwordHash;
}

/** Read-only: every active membership of the community, classified. */
export async function previewCommunityActivation(c: ActivationCampaign): Promise<{
  groupName: string;
  groupSlug: string;
  recipients: ActivationRecipient[];
  counts: Record<ActivationState, number> & { total: number };
}> {
  const db = getAdminDb();
  const groupSnap = await db.doc(`subAccounts/${c.subAccountId}/communityGroups/${c.groupId}`).get();
  if (!groupSnap.exists) throw new Error("Community not found.");
  const group = groupSnap.data() as { name?: string; slug?: string };
  const exclude = new Set((c.excludeEmails ?? []).map((e) => e.trim().toLowerCase()));
  const memberships = await groupSnap.ref.collection("memberships").where("status", "==", "active").get();

  const recipients: ActivationRecipient[] = [];
  for (const m of memberships.docs) {
    const memberSnap = await db.doc(`subAccounts/${c.subAccountId}/members/${m.id}`).get();
    const member = memberSnap.data() as Omit<Member, "id"> | undefined;
    const email = (member?.email ?? "").trim().toLowerCase();
    const base = { memberId: m.id, email, firstName: firstNameOf(member?.displayName) };
    if (!member || (member.status && member.status !== "active")) {
      recipients.push({ ...base, state: "inactive_member", reason: "Member record missing or not active" });
    } else if (!EMAIL_RE.test(email)) {
      recipients.push({ ...base, state: "invalid_email", reason: "Missing or invalid email" });
    } else if (exclude.has(email)) {
      recipients.push({ ...base, state: "excluded", reason: "Excluded for this send" });
    } else if (member.emailVerified === false) {
      recipients.push({ ...base, state: "unverified_member", reason: "Email not yet proven (instant sign-up)" });
    } else if (((await ledgerRef(c, m.id).get()).data()?.status ?? "failed") !== "failed") {
      recipients.push({ ...base, state: "already_sent", reason: "Already sent for this campaign" });
    } else if (await personHasPassword(member.personId, email)) {
      recipients.push({ ...base, state: "already_active", reason: "Already has a MyMagnetix password" });
    } else {
      recipients.push({ ...base, state: "needs_activation" });
    }
  }
  const counts = {
    total: recipients.length,
    needs_activation: 0,
    already_active: 0,
    already_sent: 0,
    invalid_email: 0,
    inactive_member: 0,
    unverified_member: 0,
    excluded: 0,
  };
  for (const r of recipients) counts[r.state]++;
  return { groupName: group.name ?? "", groupSlug: group.slug ?? "", recipients, counts };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function communityActivationSubject(communityName: string): string {
  return `Your ${communityName} access is ready ✨`;
}

/** The owner-approved copy. `link` is the recipient's own set-password URL. */
export function renderCommunityActivationEmail({
  firstName,
  communityName,
  link,
  loginUrl,
}: {
  firstName: string;
  communityName: string;
  link: string;
  loginUrl: string;
}): { subject: string; text: string; html: string } {
  const subject = communityActivationSubject(communityName);
  const text = `Hey ${firstName},

Your ${communityName} access is ready! 🎉

We’ve already added you to the community — there’s just one quick step left before you can get inside.

Set up your password to activate your MyMagnetix account.

Once your password is created, you’ll be able to log in and access the ${communityName} from your MyMagnetix account.

Set My Password + Access the Community:
${link}

I’m excited to have you inside. 💜

With infinite love,
Quiana

—
This link is just for you and works once within 7 days. If it has expired, go to ${loginUrl} and choose “Forgot password?” to get a new one.
`;
  const n = escapeHtml(firstName);
  const c = escapeHtml(communityName);
  const href = escapeHtml(link);
  const login = escapeHtml(loginUrl);
  const p = 'style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#2a2230;"';
  const html = `<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#f7f5f9;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7f5f9;padding:32px 12px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #ece6f1;border-radius:14px;">
<tr><td style="padding:36px 32px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
<p ${p}>Hey ${n},</p>
<p ${p}>Your ${c} access is ready! 🎉</p>
<p ${p}>We’ve already added you to the community — there’s just one quick step left before you can get inside.</p>
<p ${p}>Set up your password to activate your MyMagnetix account.</p>
<p ${p}>Once your password is created, you’ll be able to log in and access the ${c} from your MyMagnetix account.</p>
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 24px;"><tr><td style="border-radius:10px;background:#3d1650;">
<a href="${href}" style="display:inline-block;padding:14px 22px;font-size:16px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:10px;">Set My Password + Access the Community</a>
</td></tr></table>
<p ${p}>I’m excited to have you inside. 💜</p>
<p style="margin:0;font-size:16px;line-height:1.6;color:#2a2230;">With infinite love,<br>Quiana</p>
</td></tr>
<tr><td style="padding:16px 32px 28px;border-top:1px solid #f0ebf3;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:12px;line-height:1.6;color:#7b7182;">
This link is just for you and works once within 7 days. If it has expired, go to <a href="${login}" style="color:#5b3fc4;">${login.replace(/^https:\/\//, "")}</a> and choose “Forgot password?” to get a new one.
</td></tr>
</table>
</td></tr></table>
</body></html>`;
  return { subject, text, html };
}

export type ActivationSendResult =
  | { ok: true; memberId: string; messageId: string }
  | { ok: false; memberId: string; skipped: ActivationState | "send_failed"; reason: string };

type SendFn = (input: { to: string; subject: string; text: string; html: string; idempotencyKey: string }) => Promise<{ id: string }>;

/**
 * Sends one member's activation email. `test: true` skips the duplicate
 * ledger (for the owner's own test sends) but otherwise runs the exact same
 * path. `send` is injectable for emulator tests; production uses the
 * workspace's verified sender.
 */
export async function sendCommunityActivationEmail(
  c: ActivationCampaign & { origin: string },
  memberId: string,
  opts: { test?: boolean; send?: SendFn } = {}
): Promise<ActivationSendResult> {
  const db = getAdminDb();
  const [subSnap, groupSnap, memberSnap, membershipSnap] = await Promise.all([
    db.doc(`subAccounts/${c.subAccountId}`).get(),
    db.doc(`subAccounts/${c.subAccountId}/communityGroups/${c.groupId}`).get(),
    db.doc(`subAccounts/${c.subAccountId}/members/${memberId}`).get(),
    db.doc(`subAccounts/${c.subAccountId}/communityGroups/${c.groupId}/memberships/${memberId}`).get(),
  ]);
  const member = memberSnap.data() as Omit<Member, "id"> | undefined;
  const email = (member?.email ?? "").trim().toLowerCase();
  if (!groupSnap.exists || !member || membershipSnap.data()?.status !== "active" || (member.status && member.status !== "active")) {
    return { ok: false, memberId, skipped: "inactive_member", reason: "Not an active member of this community" };
  }
  if (!EMAIL_RE.test(email)) return { ok: false, memberId, skipped: "invalid_email", reason: "Missing or invalid email" };
  if (member.emailVerified === false) {
    return { ok: false, memberId, skipped: "unverified_member", reason: "Email not yet proven" };
  }
  const personId = await ensurePersonLinkForMember(c.subAccountId, { id: memberId, ...member });
  if (!personId) return { ok: false, memberId, skipped: "inactive_member", reason: "Could not link the MyMagnetix identity" };
  if (await personHasPassword(personId, email)) {
    return { ok: false, memberId, skipped: "already_active", reason: "Already has a MyMagnetix password" };
  }

  const ledger = ledgerRef(c, memberId);
  if (!opts.test) {
    try {
      await ledger.create({
        campaign: c.campaign,
        memberId,
        personId,
        email,
        status: "sending",
        createdAt: FieldValue.serverTimestamp(),
      });
    } catch {
      // Only a FAILED earlier attempt may be retried; a sent (or in-flight)
      // one never goes out twice.
      const claimed = await db.runTransaction(async (tx) => {
        const snap = await tx.get(ledger);
        if (snap.data()?.status !== "failed") return false;
        tx.set(ledger, { status: "sending", retriedAt: FieldValue.serverTimestamp() }, { merge: true });
        return true;
      });
      if (!claimed) return { ok: false, memberId, skipped: "already_sent", reason: "Already sent for this campaign" };
    }
  }

  const groupSlug = (groupSnap.data()?.slug as string) || c.groupId;
  const nextPath = `/api/my/enter?subAccountId=${encodeURIComponent(c.subAccountId)}&next=${encodeURIComponent(`/c/${c.subAccountId}/${groupSlug}`)}`;
  const token = await createPersonPasswordToken({
    personId,
    email,
    purpose: "activation",
    ttlMs: COMMUNITY_ACTIVATION_TTL_MS,
    nextPath,
  });
  const origin = c.origin.replace(/\/$/, "");
  const link = `${origin}/my/password/reset?${new URLSearchParams({ token }).toString()}`;
  const content = renderCommunityActivationEmail({
    firstName: firstNameOf(member.displayName),
    communityName: c.communityName,
    link,
    loginUrl: `${origin}/my/login`,
  });
  const idempotencyKey = `${c.campaign}-${memberId}${opts.test ? `-test-${Date.now()}` : ""}`;

  try {
    const sendFn: SendFn =
      opts.send ??
      ((input) =>
        sendTenantEmail({
          sub: subSnap.data() as never,
          to: input.to,
          subject: input.subject,
          text: input.text,
          html: input.html,
          idempotencyKey: input.idempotencyKey,
        }));
    const sent = await sendFn({ to: email, ...content, idempotencyKey });
    if (!opts.test) {
      await ledger.set({ status: "sent", messageId: sent.id, sentAt: FieldValue.serverTimestamp() }, { merge: true });
    }
    return { ok: true, memberId, messageId: sent.id };
  } catch (err) {
    if (!opts.test) {
      await ledger.set(
        { status: "failed", error: err instanceof Error ? err.message.slice(0, 300) : "send failed", failedAt: FieldValue.serverTimestamp() },
        { merge: true }
      );
    }
    return { ok: false, memberId, skipped: "send_failed", reason: err instanceof Error ? err.message : "Send failed" };
  }
}
