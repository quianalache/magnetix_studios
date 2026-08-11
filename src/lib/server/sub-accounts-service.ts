import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { seedDefaultTemplates } from "@/lib/automations/seed-templates";
import { createInviteServerSide } from "@/lib/server/members-service";
import { GLOBAL_TERRITORY_ID } from "@/types";

/**
 * Server-side sub-account creation — the single write path shared by the
 * agency create route (`POST /api/agency/sub-accounts`) and the AI Suite
 * `create_sub_account` capability. Extracted so both call one transactional
 * implementation and can't drift (feature gates, counter, membership,
 * template seeding all stay in lockstep).
 *
 * Auth + input validation stay with the caller — this function trusts its
 * inputs and just does the write.
 */

const STARTING_ACCOUNT_NUMBER = 1000;

export interface CreateSubAccountInput {
  agencyId: string;
  /** The agency owner performing the create. */
  uid: string;
  email: string;
  displayName: string;
  /** Already-validated display name. */
  name: string;
  /** Already-validated slug (lowercase/numbers/dashes) or "" to auto-derive. */
  slug: string;
  /** IANA timezone or "UTC". */
  timezone: string;
  accountContact: {
    name: string | null;
    email: string | null;
    phone: string | null;
  } | null;
}

export interface CreateSubAccountResult {
  subAccountId: string;
  accountNumber: number;
  name: string;
  agencyId: string;
  /**
   * Outcome of auto-inviting `accountContact.email` as this sub-account's
   * admin — see {@link inviteAccountContactIfProvided}. Sub-account creation
   * always succeeds regardless of what happened here; the caller surfaces
   * this so a failed/undelivered invite doesn't go unnoticed.
   */
  invite: InviteOutcome;
}

/**
 * Result of the best-effort "invite the account contact" step run right
 * after a sub-account is created. `attempted: false` means no email was
 * given (the normal case for internal/personal sub-accounts) — nothing
 * failed, there was just nothing to do.
 */
export interface InviteOutcome {
  attempted: boolean;
  email: string | null;
  /** True once a real email actually went out (new pending invite OR an
   *  existing-user "added" notice) — mirrors `CreateInviteResult.mailed`. */
  mailed: boolean;
  /** Non-fatal delivery failure from inside the invite system itself
   *  (e.g. Resend send failed) — the invite/membership was still written. */
  mailError: string | null;
  /** True when the email already had a Firebase Auth account and was added
   *  to this sub-account directly, rather than getting a pending invite. */
  added: boolean;
  /** Set when the invite step failed outright (e.g. the contact's email
   *  belongs to a removed/disabled account, or an unexpected error) — the
   *  sub-account itself was still created; this just means onboarding for
   *  that email needs manual attention (Settings → Members). */
  error: string | null;
}

/**
 * Top-level collections keyed by `subAccountId` whose presence means the
 * sub-account has been genuinely used. Seeded/auto-created data (the owner
 * membership, welcome `message_templates`, counters, the `userMemberships`
 * index) is deliberately excluded — a freshly-created test sub-account still
 * counts as "clean". Each entry maps a collection to the human label shown to
 * the agency owner when a delete is blocked.
 */
const USAGE_COLLECTIONS: ReadonlyArray<{ collection: string; label: string }> = [
  { collection: "contacts", label: "contacts" },
  { collection: "deals", label: "deals" },
  { collection: "tasks", label: "tasks" },
  { collection: "events", label: "calendar events" },
  { collection: "forms", label: "forms" },
  { collection: "quotes", label: "quotes / invoices" },
  { collection: "products", label: "products" },
  { collection: "automations", label: "automations" },
  { collection: "broadcasts", label: "broadcasts" },
  { collection: "socialPosts", label: "social posts" },
  { collection: "voiceCampaigns", label: "voice campaigns" },
];

/**
 * Thrown by {@link deleteSubAccountForAgency} when the sub-account still holds
 * real data. `blockers` is the list of human labels (e.g. `["contacts",
 * "deals"]`) the route surfaces so the owner knows why it was refused.
 */
export class SubAccountNotEmptyError extends Error {
  readonly blockers: string[];
  constructor(blockers: string[]) {
    super(`Sub-account is not empty: ${blockers.join(", ")}`);
    this.name = "SubAccountNotEmptyError";
    this.blockers = blockers;
  }
}

/** Thrown when the target sub-account doesn't exist or isn't in this agency. */
export class SubAccountNotFoundError extends Error {
  constructor() {
    super("Sub-account not found");
    this.name = "SubAccountNotFoundError";
  }
}

/**
 * Delete a **clean** (unused) sub-account. Agency-owner-gated at the route;
 * this trusts its inputs. Refuses (throws {@link SubAccountNotEmptyError}) if
 * any {@link USAGE_COLLECTIONS} query finds a doc, so a sub-account with real
 * CRM data can never be removed here. On a clean delete it removes the seeded
 * welcome templates, every member's `userMemberships` index entry, and then
 * recursively deletes the `subAccounts/{id}` doc + all its subcollections.
 *
 * The per-agency account-number counter is intentionally left untouched so
 * numbers are never reused.
 */
export async function deleteSubAccountForAgency(input: {
  agencyId: string;
  subAccountId: string;
}): Promise<void> {
  const { agencyId, subAccountId } = input;
  const db = getAdminDb();

  const subRef = db.doc(`subAccounts/${subAccountId}`);
  const subSnap = await subRef.get();
  // Scope the delete to the caller's own agency — a mismatched agencyId reads
  // as "not found" so we never leak the existence of another agency's doc.
  if (!subSnap.exists || subSnap.data()?.agencyId !== agencyId) {
    throw new SubAccountNotFoundError();
  }

  // Emptiness guard — one .limit(1) probe per usage collection, in parallel.
  const probes = await Promise.all(
    USAGE_COLLECTIONS.map(async ({ collection, label }) => {
      const snap = await db
        .collection(collection)
        .where("subAccountId", "==", subAccountId)
        .limit(1)
        .get();
      return snap.empty ? null : label;
    }),
  );
  const blockers = probes.filter((l): l is string => l !== null);
  if (blockers.length > 0) throw new SubAccountNotEmptyError(blockers);

  // Read members first (their subcollection is about to be recursively
  // deleted) so we can prune the denormalized userMemberships index.
  const membersSnap = await subRef.collection("subAccountMembers").get();
  const memberUids = membersSnap.docs.map((d) => d.id);

  // Delete seeded top-level welcome templates for this sub-account.
  const templatesSnap = await db
    .collection("message_templates")
    .where("subAccountId", "==", subAccountId)
    .get();

  const batch = db.batch();
  for (const uid of memberUids) {
    batch.delete(db.doc(`userMemberships/${uid}/subAccounts/${subAccountId}`));
  }
  for (const doc of templatesSnap.docs) batch.delete(doc.ref);
  await batch.commit();

  // Finally remove the sub-account doc and every descendant subcollection
  // (members, counters, aiSuiteUsage, aiAgent, apiKeys, website, …).
  await db.recursiveDelete(subRef);
}

export async function createSubAccountForAgency(
  input: CreateSubAccountInput,
): Promise<CreateSubAccountResult> {
  const { agencyId, uid, email, displayName, name, slug, timezone, accountContact } =
    input;

  const db = getAdminDb();
  const subRef = db.collection("subAccounts").doc();
  const subAccountId = subRef.id;
  const counterRef = db.doc(`agencies/${agencyId}/counters/subAccount`);

  // Transactional counter increment so two simultaneous creates can't
  // collide on the same account number. Fallback to 1000 lets older
  // agencies (no counter doc yet) pick up smoothly.
  const accountNumber = await db.runTransaction<number>(async (tx) => {
    const counterSnap = await tx.get(counterRef);
    const current = counterSnap.exists
      ? (counterSnap.data()?.next as number | undefined) ??
        STARTING_ACCOUNT_NUMBER
      : STARTING_ACCOUNT_NUMBER;
    tx.set(counterRef, { next: current + 1 });

    tx.set(subRef, {
      id: subAccountId,
      agencyId,
      accountNumber: current,
      name,
      slug: slug || subAccountId.slice(0, 8),
      status: "active",
      timezone,
      createdByUid: uid,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
      twilioConfig: null,
      resendConfig: null,
      emailDomainEnabledByAgency: false,
      outboundVoiceEnabledByAgency: false,
      whatsappEnabledByAgency: false,
      // Default ON (opt-out): these AI channels pre-existed agency gating, so
      // new sub-accounts match the historical always-on behavior. The agency
      // flips them off to clamp cost. See gates.ts / SubAccountDoc docs.
      smsAgentEnabledByAgency: true,
      webChatEnabledByAgency: true,
      inboundVoiceEnabledByAgency: true,
      metaInboxEnabledByAgency: false,
      metaAgentEnabledByAgency: false,
      // Default ON — normal product features with no per-use shared cost
      // (2026-08-11 defaults change). Community/Courses/Website/Broadcasts/
      // Social Planner are ordinary CRM surfaces, not credit-metered AI
      // channels; there's no cost reason to make a brand-new sub-account
      // hunt for them behind an agency-owner toggle at this stage (pre
      // plan-based gating). See the sub-account feature-defaults audit.
      websiteEnabledByAgency: true,
      communityEnabledByAgency: true,
      standaloneCoursesEnabledByAgency: true,
      broadcastsEnabledByAgency: true,
      socialPlannerEnabledByAgency: true,
      getLeadsEnabledByAgency: false,
      missedCallTextBackEnabledByAgency: false,
      // Labs (pre-release features) ships OFF — explicit opt-in per client.
      labsEnabledByAgency: false,
      // Workspace Assistant ships OFF like every other credit-metered gate
      // (opt-in) — the agency owner enables it per sub-account from the
      // Manage dialog. Unlike Community/Courses/etc above, every reply here
      // spends real shared OpenRouter credits, so this one stays closed.
      aiSuiteEnabledByAgency: false,
      metaConfig: null,
      bookingConfig: null,
      sendWindow: null,
      bookingLink: null,
      replyToEmail: null,
      automationsPaused: false,
      accountContact,
    });

    // Agency owner is implicitly admin in every sub-account; we still write
    // the membership doc so the userMemberships index lights up the switcher.
    tx.set(subRef.collection("subAccountMembers").doc(uid), {
      uid,
      subAccountId,
      agencyId,
      role: "admin",
      status: "active",
      email,
      displayName,
      addedAt: FieldValue.serverTimestamp(),
      addedByUid: uid,
      assignedTerritoryIds: [GLOBAL_TERRITORY_ID],
    });

    tx.set(db.doc(`userMemberships/${uid}/subAccounts/${subAccountId}`), {
      subAccountId,
      agencyId,
      accountNumber: current,
      role: "admin",
      name,
      addedAt: FieldValue.serverTimestamp(),
    });

    // Seed Welcome email + Welcome SMS templates so every new sub-account
    // starts with usable defaults.
    seedDefaultTemplates(db, (ref, data) => tx.set(ref, data), {
      agencyId,
      subAccountId,
      createdByUid: uid,
    });

    return current;
  });

  // Best-effort: invite the account contact (if one was given) into the new
  // sub-account as its admin. Deliberately OUTSIDE the transaction above —
  // it needs to call Firebase Auth (auth.getUserByEmail) and send a real
  // email, neither of which belongs inside a Firestore transaction. Reuses
  // the exact same invite system Settings → Members already uses (see
  // members-service.ts) — no second onboarding/auth path. Never throws:
  // the sub-account is already created and committed by this point, so a
  // failed invite is reported back to the caller, not treated as a failed
  // create.
  const invite = await inviteAccountContactIfProvided({
    subAccountId,
    invitedByUid: uid,
    email: accountContact?.email ?? null,
  });

  return { subAccountId, accountNumber, name, agencyId, invite };
}

/**
 * Invite `email` into `subAccountId` as admin via the shared invite system,
 * normalizing every outcome (including failures) into an {@link InviteOutcome}
 * so the caller can always report something sensible instead of an unhandled
 * rejection. `email` blank/absent → `attempted: false`, nothing happens —
 * the normal case for internal/personal sub-accounts with no named contact.
 */
async function inviteAccountContactIfProvided(params: {
  subAccountId: string;
  invitedByUid: string;
  email: string | null;
}): Promise<InviteOutcome> {
  const email = params.email?.trim().toLowerCase() || null;
  if (!email) {
    return { attempted: false, email: null, mailed: false, mailError: null, added: false, error: null };
  }
  try {
    const res = await createInviteServerSide({
      subAccountId: params.subAccountId,
      invitedByUid: params.invitedByUid,
      email,
      // The account contact becomes this sub-account's admin, not a
      // collaborator — they're the customer this workspace belongs to.
      role: "admin",
    });
    return {
      attempted: true,
      email,
      mailed: res.mailed,
      mailError: res.mailError,
      added: res.added,
      error: null,
    };
  } catch (err) {
    // Covers MemberAddBlockedError (e.g. the email belongs to a removed/
    // disabled account or a different agency) and any unexpected failure.
    // The sub-account itself still exists — surface this so the agency
    // owner knows onboarding needs manual attention (Settings → Members)
    // instead of silently having no idea the invite never went out.
    console.error(
      `[sub-accounts] auto-invite failed for ${params.subAccountId} (${email})`,
      err,
    );
    const message =
      err instanceof Error ? err.message : "Could not invite the account contact.";
    return { attempted: true, email, mailed: false, mailError: null, added: false, error: message };
  }
}
