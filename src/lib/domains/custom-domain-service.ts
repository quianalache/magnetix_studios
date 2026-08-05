import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import {
  addDomainToProject,
  getDomainStatus,
  removeDomainFromProject,
  verifyProjectDomain,
} from "@/lib/vercel/domains";
import { VercelError } from "@/lib/vercel/client";
import type { SubAccountCustomDomain, SubAccountDoc } from "@/types/tenancy";

/**
 * Per-sub-account custom domain for PUBLIC pages (booking/decoder/courses/
 * portal) — the Firestore-aware layer on top of `src/lib/vercel/domains.ts`,
 * same split as `resend-domains.ts` (pure API helpers) vs. the
 * `/api/sub-accounts/[id]/resend` route (persistence + auth). Kept
 * intentionally NOT wired into the agency-wide PlanGateKey/feature-gates-
 * service/Manage-dialog machinery yet — `customDomainEnabledByAgency` is a
 * plain field, flipped directly for the one real sub-account using this so
 * far. Generalize into that system once more than one sub-account needs it
 * (see the custom-domain scoping notes).
 */

const LABEL_RE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

export interface DomainValidation {
  ok: boolean;
  domain: string;
  error: string | null;
}

/** Normalize + sanity-check a user-typed domain. Root domains ARE allowed (unlike the Resend sending-domain flow, which requires a subdomain). */
export function validateCustomDomain(input: string): DomainValidation {
  const fail = (error: string): DomainValidation => ({ ok: false, domain: "", error });
  const domain = (input ?? "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "")
    .replace(/^www\./, "")
    .replace(/\.$/, "");
  if (!domain) return fail("Enter a domain.");
  const labels = domain.split(".");
  if (labels.length < 2) return fail("Enter a full domain, e.g. yourdomain.com.");
  if (!labels.every((l) => LABEL_RE.test(l))) {
    return fail("That doesn't look like a valid domain.");
  }
  return { ok: true, domain, error: null };
}

function subRef(subAccountId: string) {
  return getAdminDb().doc(`subAccounts/${subAccountId}`);
}

/**
 * Register `domain` with the Vercel project and persist the pending state +
 * whatever DNS records Vercel wants added. Replacing a previously-registered
 * domain removes the old one from the project first (best-effort) so Vercel
 * doesn't accrue orphaned domain attachments.
 */
export async function addCustomDomain(opts: {
  subAccountId: string;
  domain: string;
}): Promise<SubAccountCustomDomain> {
  const ref = subRef(opts.subAccountId);
  const snap = await ref.get();
  const sub = (snap.data() ?? {}) as Partial<SubAccountDoc>;

  const existing = sub.customDomain;
  if (existing?.domain && existing.domain !== opts.domain) {
    try {
      await removeDomainFromProject(existing.domain);
    } catch {
      // Best-effort — an already-detached or never-fully-added domain
      // 404s here; don't block the new domain on cleaning up the old one.
    }
  }

  const added = await addDomainToProject(opts.domain);
  // Vercel addresses project-domains by name, not a separate opaque id
  // (unlike env vars) — the domain string itself is what every subsequent
  // verify/status/remove call keys off.
  const record: SubAccountCustomDomain = {
    domain: opts.domain,
    vercelDomainId: opts.domain,
    status: added.verified ? "verified" : "pending",
    verificationRecords: added.verification ?? [],
    rootRedirectUrl: existing?.domain === opts.domain ? (existing.rootRedirectUrl ?? null) : null,
    addedAt: existing?.domain === opts.domain ? existing.addedAt : new Date(),
    verifiedAt: added.verified ? new Date() : null,
    lastCheckedAt: new Date(),
  };
  await ref.set(
    { customDomain: record, updatedAt: FieldValue.serverTimestamp() },
    { merge: true },
  );
  return record;
}

/** Re-check the live status with Vercel and persist any change. Safe to call repeatedly (settings UI's "Check status" button). */
export async function refreshCustomDomainStatus(
  subAccountId: string,
): Promise<SubAccountCustomDomain | null> {
  const ref = subRef(subAccountId);
  const snap = await ref.get();
  const sub = (snap.data() ?? {}) as Partial<SubAccountDoc>;
  const current = sub.customDomain;
  if (!current?.domain) return null;

  let status: Awaited<ReturnType<typeof getDomainStatus>>;
  try {
    // A verify call first — Vercel only flips `verified` after this is hit,
    // it doesn't happen passively just by DNS being correct.
    await verifyProjectDomain(current.domain);
    status = await getDomainStatus(current.domain);
  } catch (e) {
    const updated: SubAccountCustomDomain = {
      ...current,
      status: "error",
      lastCheckedAt: new Date(),
    };
    await ref.set({ customDomain: updated }, { merge: true });
    throw e instanceof VercelError ? e : new Error("Couldn't reach Vercel to check domain status.");
  }

  const updated: SubAccountCustomDomain = {
    ...current,
    status: status.verified ? "verified" : status.misconfigured ? "error" : "pending",
    verificationRecords: status.verification,
    verifiedAt: status.verified ? (current.verifiedAt ?? new Date()) : null,
    lastCheckedAt: new Date(),
  };
  await ref.set({ customDomain: updated }, { merge: true });
  return updated;
}

export async function removeCustomDomain(subAccountId: string): Promise<void> {
  const ref = subRef(subAccountId);
  const snap = await ref.get();
  const sub = (snap.data() ?? {}) as Partial<SubAccountDoc>;
  const current = sub.customDomain;
  if (current?.domain) {
    try {
      await removeDomainFromProject(current.domain);
    } catch {
      // Best-effort, same reasoning as the replace path above.
    }
  }
  await ref.set(
    { customDomain: null, updatedAt: FieldValue.serverTimestamp() },
    { merge: true },
  );
}

/** Set/clear where the domain's bare root ("/") redirects — e.g. an existing community/landing page. Null shows the built-in placeholder instead. */
export async function setCustomDomainRootRedirect(opts: {
  subAccountId: string;
  rootRedirectUrl: string | null;
}): Promise<void> {
  const ref = subRef(opts.subAccountId);
  const snap = await ref.get();
  const sub = (snap.data() ?? {}) as Partial<SubAccountDoc>;
  if (!sub.customDomain) {
    throw new Error("Add a custom domain before setting a root redirect.");
  }
  await ref.set(
    {
      customDomain: { ...sub.customDomain, rootRedirectUrl: opts.rootRedirectUrl },
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
}

/**
 * Host → sub-account lookup for the public custom-domain routes
 * (/booking/[slug], /decoder, /courses/[slug], /portal, and the root
 * redirect). Only matches a VERIFIED domain — a pending/error domain keeps
 * 404ing on its type-prefixed paths until DNS actually checks out, so a
 * half-configured domain never serves a broken tenant mix-up.
 */
export async function getSubAccountByCustomDomain(
  hostHeader: string | null,
): Promise<(SubAccountDoc & { id: string }) | null> {
  if (!hostHeader) return null;
  const host = hostHeader.split(":")[0].trim().toLowerCase().replace(/^www\./, "");
  if (!host) return null;

  const snap = await getAdminDb()
    .collection("subAccounts")
    .where("customDomain.domain", "==", host)
    .limit(1)
    .get();
  if (snap.empty) return null;
  const doc = snap.docs[0];
  const data = doc.data() as SubAccountDoc;
  if (data.customDomain?.status !== "verified") return null;
  return { ...data, id: doc.id };
}
