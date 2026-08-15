import "server-only";

import { randomBytes, scrypt, timingSafeEqual, createHash } from "crypto";
import { promisify } from "util";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { emailIsConfigured, sendEmail } from "@/lib/comms/resend";
import { signPersonSessionToken } from "@/lib/server/person-auth";
import { ensurePersonIdentity } from "@/lib/server/person-identity-service";

/**
 * MyMagnetix global Person password — deliberate sibling of
 * `src/lib/community/member-password.ts`, operating on `people/{id}`
 * instead of a tenant `Member` doc. This is a NEW, additive password
 * namespace: a `people/{id}.passwordHash` field that did not exist before
 * MyMagnetix, never copied from or compared against any tenant Member's
 * `passwordHash`. A Person and a Member sharing the same personId/email
 * can therefore hold two completely independent passwords (a real,
 * accepted tradeoff — the alternative, silently treating one tenant's
 * Member password as the global password, was explicitly ruled out).
 *
 * Reset/setup tokens live in their own top-level `personPasswordTokens`
 * collection (vs. Member's per-sub-account
 * `subAccounts/{id}/memberPasswordTokens`), since a Person has no sub-account.
 */

const scryptAsync = promisify(scrypt);

const HASH_PREFIX = "scrypt";
const HASH_KEYLEN = 64;
const PASSWORD_MIN_LENGTH = 8;
const RESET_TTL_MS = 60 * 60 * 1000;

export const PERSON_PASSWORD_RESET_GENERIC_MESSAGE =
  "If that email belongs to a MyMagnetix account, we'll send password instructions.";

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function validatePersonPassword(password: string): string | null {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `Password must be at least ${PASSWORD_MIN_LENGTH} characters.`;
  }
  if (password.length > 256) {
    return "Password is too long.";
  }
  return null;
}

export async function hashPersonPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("base64url");
  const derived = (await scryptAsync(password, salt, HASH_KEYLEN)) as Buffer;
  return `${HASH_PREFIX}$1$${salt}$${derived.toString("base64url")}`;
}

export async function verifyPersonPassword(
  password: string,
  stored: string | null | undefined,
): Promise<boolean> {
  if (!stored) return false;
  const [prefix, version, salt, hash] = stored.split("$");
  if (prefix !== HASH_PREFIX || version !== "1" || !salt || !hash) return false;
  const expected = Buffer.from(hash, "base64url");
  const actual = (await scryptAsync(password, salt, expected.length)) as Buffer;
  if (expected.length !== actual.length) return false;
  return timingSafeEqual(expected, actual);
}

interface PersonRecord {
  id: string;
  primaryEmail: string;
  passwordHash?: string | null;
}

async function findPersonByEmail(email: string): Promise<PersonRecord | null> {
  const snap = await getAdminDb()
    .collection("people")
    .where("primaryEmail", "==", normalizeEmail(email))
    .limit(1)
    .get();
  if (snap.empty) return null;
  const doc = snap.docs[0];
  return { id: doc.id, ...(doc.data() as Omit<PersonRecord, "id">) };
}

export async function authenticatePersonWithPassword({
  email,
  password,
}: {
  email: string;
  password: string;
}): Promise<{ ok: true; personId: string; sessionToken: string } | { ok: false }> {
  const normalizedEmail = normalizeEmail(email);
  if (!isValidEmail(normalizedEmail) || !password) return { ok: false };
  const person = await findPersonByEmail(normalizedEmail);
  if (!person) return { ok: false };
  const valid = await verifyPersonPassword(password, person.passwordHash);
  if (!valid) return { ok: false };
  const sessionToken = signPersonSessionToken(person.id, normalizedEmail);
  return { ok: true, personId: person.id, sessionToken };
}

function tokenDigest(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createPersonPasswordToken({
  personId,
  email,
  purpose,
}: {
  personId: string;
  email: string;
  purpose: "setup" | "reset";
}): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  const digest = tokenDigest(token);
  await getAdminDb()
    .doc(`personPasswordTokens/${digest}`)
    .set({
      personId,
      email: normalizeEmail(email),
      purpose,
      createdAt: FieldValue.serverTimestamp(),
      expiresAt: Timestamp.fromMillis(Date.now() + RESET_TTL_MS),
      usedAt: null,
    });
  return token;
}

export async function consumePersonPasswordToken({
  token,
  password,
}: {
  token: string;
  password: string;
}): Promise<
  | { ok: true; personId: string; sessionToken: string }
  | { ok: false; error: string }
> {
  const validationError = validatePersonPassword(password);
  if (validationError) return { ok: false, error: validationError };

  const digest = tokenDigest(token);
  const db = getAdminDb();
  const tokenRef = db.doc(`personPasswordTokens/${digest}`);

  const result = await db.runTransaction<
    { ok: true; personId: string; sessionToken: string } | { ok: false; error: string }
  >(async (tx) => {
    const tokenSnap = await tx.get(tokenRef);
    if (!tokenSnap.exists) return { ok: false, error: "Invalid or expired link." };
    const tokenData = tokenSnap.data() as {
      personId?: string;
      email?: string;
      expiresAt?: Timestamp;
      usedAt?: Timestamp | null;
    };
    if (tokenData.usedAt) return { ok: false, error: "Invalid or expired link." };
    if (!tokenData.personId || !tokenData.email) {
      return { ok: false, error: "Invalid or expired link." };
    }
    if (!tokenData.expiresAt || tokenData.expiresAt.toMillis() < Date.now()) {
      return { ok: false, error: "Invalid or expired link." };
    }

    const personRef = db.doc(`people/${tokenData.personId}`);
    const personSnap = await tx.get(personRef);
    if (!personSnap.exists) return { ok: false, error: "Invalid or expired link." };
    if ((personSnap.data()?.primaryEmail as string) !== tokenData.email) {
      return { ok: false, error: "Invalid or expired link." };
    }

    const passwordHash = await hashPersonPassword(password);
    tx.set(
      personRef,
      { passwordHash, passwordUpdatedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() },
      { merge: true },
    );
    tx.set(tokenRef, { usedAt: FieldValue.serverTimestamp() }, { merge: true });

    const sessionToken = signPersonSessionToken(tokenData.personId, tokenData.email);
    return { ok: true, personId: tokenData.personId, sessionToken };
  });

  return result;
}

/**
 * Sends a "set your password" (no password on file yet) or "reset your
 * password" (already has one) email. Deliberately account-enumeration-safe
 * at the CALLER level (the API route always returns the generic message
 * regardless of what this resolves to) — mirrors sendMemberPasswordEmail.
 *
 * Uses the platform-wide shared sender (`sendEmail`, no tenant `from`
 * override) since a Person is not owned by any one sub-account — there is
 * no tenant sending-domain to pick from here, unlike Member emails.
 */
export async function sendPersonPasswordEmail({
  email,
  origin,
  nextPath,
}: {
  email: string;
  origin: string;
  nextPath?: string | null;
}): Promise<void> {
  const normalizedEmail = normalizeEmail(email);
  if (!isValidEmail(normalizedEmail)) return;
  if (!emailIsConfigured()) return;

  // Only send to emails that already resolve to SOME real relationship
  // (a Member or staff user) — never silently mint a brand-new, orphaned
  // Person purely because someone typed an email into this form. This
  // mirrors sendMemberPasswordEmail's own "member must already exist"
  // gate, translated to the global layer.
  const person = await findPersonByEmail(normalizedEmail);
  if (!person) return;

  const token = await createPersonPasswordToken({
    personId: person.id,
    email: normalizedEmail,
    purpose: person.passwordHash ? "reset" : "setup",
  });
  const qs = new URLSearchParams({ token });
  if (nextPath) qs.set("next", nextPath);
  const link = `${origin.replace(/\/$/, "")}/my/password/reset?${qs.toString()}`;
  const subject = person.passwordHash ? "Reset your MyMagnetix password" : "Set your MyMagnetix password";
  const action = person.passwordHash ? "reset your password" : "set your password";

  await sendEmail({
    to: normalizedEmail,
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

/**
 * Resolves-or-creates the person identity for a magic-link VERIFY (an email
 * that just proved ownership by clicking the link) and returns a fresh
 * session token. Unlike `sendPersonPasswordEmail`, this path is allowed to
 * create a brand-new `people` doc — same rationale as `ensureMember`: the
 * email owner just proved control of the inbox by clicking a real,
 * short-lived, signed link, which is a legitimate identity claim on its own.
 */
export async function establishPersonSessionForEmail(email: string): Promise<{
  personId: string;
  sessionToken: string;
}> {
  const normalizedEmail = normalizeEmail(email);
  const personId = await ensurePersonIdentity(normalizedEmail);
  const sessionToken = signPersonSessionToken(personId, normalizedEmail);
  return { personId, sessionToken };
}
