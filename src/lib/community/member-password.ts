import "server-only";

import { randomBytes, scrypt, timingSafeEqual, createHash } from "crypto";
import { promisify } from "util";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { emailIsConfigured, sendTenantEmail } from "@/lib/comms/resend";
import { signMemberSessionToken } from "@/lib/community/member-auth";
import { findMemberByEmail } from "@/lib/community/member-account";
import { ensurePersonLinkForMember } from "@/lib/server/person-identity-service";
import type { Member } from "@/types/community";
import type { SubAccountDoc } from "@/types";

const scryptAsync = promisify(scrypt);

const HASH_PREFIX = "scrypt";
const HASH_KEYLEN = 64;
const PASSWORD_MIN_LENGTH = 8;
const RESET_TTL_MS = 60 * 60 * 1000;

export const MEMBER_PASSWORD_RESET_GENERIC_MESSAGE =
  "If that email belongs to an account, we'll send password instructions.";

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function validateMemberPassword(password: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`;
  }
  if (password.length > 256) {
    return "Password is too long.";
  }
  return null;
}

export async function hashMemberPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("base64url");
  const derived = (await scryptAsync(password, salt, HASH_KEYLEN)) as Buffer;
  return `${HASH_PREFIX}$1$${salt}$${derived.toString("base64url")}`;
}

export async function verifyMemberPassword(
  password: string,
  stored: string | null | undefined
): Promise<boolean> {
  if (!stored) return false;
  const [prefix, version, salt, hash] = stored.split("$");
  if (prefix !== HASH_PREFIX || version !== "1" || !salt || !hash) return false;
  const expected = Buffer.from(hash, "base64url");
  const actual = (await scryptAsync(password, salt, expected.length)) as Buffer;
  if (expected.length !== actual.length) return false;
  return timingSafeEqual(expected, actual);
}

export async function authenticateMemberWithPassword({
  subAccountId,
  email,
  password,
}: {
  subAccountId: string;
  email: string;
  password: string;
}): Promise<
  { ok: true; member: Member; sessionToken: string } | { ok: false }
> {
  const normalizedEmail = normalizeEmail(email);
  if (!isValidEmail(normalizedEmail) || !password) return { ok: false };
  const member = await findMemberByEmail(subAccountId, normalizedEmail);
  if (!member || member.status !== "active") return { ok: false };
  const valid = await verifyMemberPassword(password, member.passwordHash);
  if (!valid) return { ok: false };
  const sessionToken = signMemberSessionToken(
    subAccountId,
    member.id,
    member.email
  );
  // MyMagnetix identity foundation (2026-08-14) — password login is the
  // one auth path that doesn't go through ensureMember (a member can only
  // have a password if they already exist), so it needs its own lazy
  // reconciliation call. No-op once already linked.
  const personId = await ensurePersonLinkForMember(subAccountId, member);
  return { ok: true, member: { ...member, personId }, sessionToken };
}

function tokenDigest(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createMemberPasswordToken({
  subAccountId,
  member,
  purpose,
}: {
  subAccountId: string;
  member: Member;
  purpose: "setup" | "reset";
}): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  const digest = tokenDigest(token);
  await getAdminDb()
    .doc(`subAccounts/${subAccountId}/memberPasswordTokens/${digest}`)
    .set({
      subAccountId,
      memberId: member.id,
      email: member.email,
      purpose,
      createdAt: FieldValue.serverTimestamp(),
      expiresAt: Timestamp.fromMillis(Date.now() + RESET_TTL_MS),
      usedAt: null,
    });
  return token;
}

export async function consumeMemberPasswordToken({
  subAccountId,
  token,
  password,
}: {
  subAccountId: string;
  token: string;
  password: string;
}): Promise<
  | { ok: true; member: Member; sessionToken: string }
  | { ok: false; error: string }
> {
  const validationError = validateMemberPassword(password);
  if (validationError) return { ok: false, error: validationError };

  const digest = tokenDigest(token);
  const db = getAdminDb();
  const tokenRef = db.doc(
    `subAccounts/${subAccountId}/memberPasswordTokens/${digest}`
  );

  const result = await db.runTransaction<
    { ok: true; member: Member; sessionToken: string } | { ok: false; error: string }
  >(async (tx) => {
    const tokenSnap = await tx.get(tokenRef);
    if (!tokenSnap.exists)
      return { ok: false, error: "Invalid or expired reset link." };
    const tokenData = tokenSnap.data() as {
      memberId?: string;
      email?: string;
      expiresAt?: Timestamp;
      usedAt?: Timestamp | null;
    };
    if (tokenData.usedAt)
      return { ok: false, error: "Invalid or expired reset link." };
    if (!tokenData.memberId || !tokenData.email) {
      return { ok: false, error: "Invalid or expired reset link." };
    }
    if (!tokenData.expiresAt || tokenData.expiresAt.toMillis() < Date.now()) {
      return { ok: false, error: "Invalid or expired reset link." };
    }

    const memberRef = db.doc(
      `subAccounts/${subAccountId}/members/${tokenData.memberId}`
    );
    const memberSnap = await tx.get(memberRef);
    if (!memberSnap.exists)
      return { ok: false, error: "Invalid or expired reset link." };
    const member = {
      id: memberSnap.id,
      ...(memberSnap.data() as Omit<Member, "id">),
    };
    if (member.status !== "active" || member.email !== tokenData.email) {
      return { ok: false, error: "Invalid or expired reset link." };
    }

    const passwordHash = await hashMemberPassword(password);
    tx.set(
      memberRef,
      {
        passwordHash,
        passwordUpdatedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    tx.set(tokenRef, { usedAt: FieldValue.serverTimestamp() }, { merge: true });

    const sessionToken = signMemberSessionToken(
      subAccountId,
      member.id,
      member.email
    );
    return { ok: true, member: { ...member, passwordHash }, sessionToken };
  });

  // MyMagnetix identity foundation (2026-08-14) — deliberately done AFTER
  // the transaction commits, not inside it: this touches a different
  // collection (`people`) than the transaction's own reads/writes
  // (memberPasswordTokens + the one member doc), and stays idempotent/
  // no-op on any transaction retry since it's a separate, safe follow-up
  // rather than part of the atomic password-set operation itself.
  if (result.ok) {
    const personId = await ensurePersonLinkForMember(subAccountId, result.member);
    return { ...result, member: { ...result.member, personId } };
  }
  return result;
}

export async function setMemberPassword({
  subAccountId,
  member,
  currentPassword,
  newPassword,
}: {
  subAccountId: string;
  member: Member;
  currentPassword?: string;
  newPassword: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const validationError = validateMemberPassword(newPassword);
  if (validationError) return { ok: false, error: validationError };
  if (member.passwordHash) {
    if (!currentPassword)
      return { ok: false, error: "Enter your current password." };
    const valid = await verifyMemberPassword(
      currentPassword,
      member.passwordHash
    );
    if (!valid) return { ok: false, error: "Current password is incorrect." };
  }

  const passwordHash = await hashMemberPassword(newPassword);
  await getAdminDb()
    .doc(`subAccounts/${subAccountId}/members/${member.id}`)
    .set(
      {
        passwordHash,
        passwordUpdatedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  return { ok: true };
}

export async function sendMemberPasswordEmail({
  subAccountId,
  email,
  origin,
  nextPath,
}: {
  subAccountId: string;
  email: string;
  origin: string;
  nextPath?: string | null;
}): Promise<void> {
  const normalizedEmail = normalizeEmail(email);
  if (!isValidEmail(normalizedEmail)) return;

  const member = await findMemberByEmail(subAccountId, normalizedEmail);
  if (!member || member.status !== "active") return;
  if (!emailIsConfigured()) return;

  const db = getAdminDb();
  const subSnap = await db.doc(`subAccounts/${subAccountId}`).get();
  if (!subSnap.exists) return;
  const sub = subSnap.data() as SubAccountDoc;
  const token = await createMemberPasswordToken({
    subAccountId,
    member,
    purpose: member.passwordHash ? "reset" : "setup",
  });
  const qs = new URLSearchParams({ token });
  if (nextPath) qs.set("next", nextPath);
  const link = `${origin.replace(/\/$/, "")}/member-password/${subAccountId}/reset?${qs.toString()}`;
  const subject = member.passwordHash
    ? "Reset your password"
    : "Set your password";
  const action = member.passwordHash
    ? "reset your password"
    : "set your password";

  await sendTenantEmail({
    sub,
    to: member.email,
    subject,
    text: `Hi,

Use the link below to ${action}. The link expires in 1 hour and can only be used once.

${link}

If you didn't request this, you can safely ignore it.
`,
    html: `<!DOCTYPE html>
<html><body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:560px;margin:32px auto;padding:0 16px;color:#202124;line-height:1.6;">
  <h1 style="font-size:20px;font-weight:600;margin:0 0 16px;">${subject}</h1>
  <p style="margin:0 0 24px;color:#3a3a44;">Use the button below to ${action}. The link expires in 1 hour.</p>
  <p style="margin:0 0 24px;">
    <a href="${link}" style="display:inline-block;background:#202124;color:#ffffff;padding:12px 20px;border-radius:8px;text-decoration:none;font-weight:500;">${subject}</a>
  </p>
  <p style="margin:24px 0 0;font-size:12px;color:#909090;">If you didn't request this, you can safely ignore it.</p>
</body></html>`,
  });
}
