/**
 * READ-ONLY. Migrated (Skool -> Magnetix) community member activation audit.
 *
 * Identifies the precise migrated-member cohort via the Skool importer's own
 * mapping ledger (subAccounts/{sa}/importMappings, entity="community_members",
 * system="skool"), then for each one reports Contact/Member/auth-credential
 * state, whether a setup/reset email was ever issued, and group-membership
 * status. No writes. No emails sent.
 *
 * Run:
 *   NODE_OPTIONS="--require ./scripts/_server-only-shim.cjs" \
 *     SUBACCOUNT_ID=xvnedVCmQpEvHrcPhEDI \
 *     SKOOL_TARGET_GROUP_SLUG=magnetic-visibility \
 *     pnpm exec tsx scripts/member-activation-audit.ts
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";

function loadEnvLocal() {
  const envPath = "/Users/quianamatthews/Documents/magnetix_studios/.env.local";
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}
loadEnvLocal();

import { getAdminDb } from "../src/lib/firebase/admin";

function tsToIso(v: unknown): string | null {
  const t = v as { toDate?: () => Date } | null | undefined;
  if (t && typeof t.toDate === "function") return t.toDate().toISOString();
  return null;
}
function tsToMillis(v: unknown): number | null {
  const t = v as { toMillis?: () => number } | null | undefined;
  return t && typeof t.toMillis === "function" ? t.toMillis() : null;
}

async function main() {
  const subAccountId = process.env.SUBACCOUNT_ID;
  if (!subAccountId) throw new Error("SUBACCOUNT_ID env var required");
  const targetSlug = process.env.SKOOL_TARGET_GROUP_SLUG ?? "magnetic-visibility";
  const db = getAdminDb();

  const groupsSnap = await db
    .collection(`subAccounts/${subAccountId}/communityGroups`)
    .where("slug", "==", targetSlug)
    .limit(2)
    .get();
  if (groupsSnap.empty) throw new Error(`Target group not found: ${targetSlug}`);
  if (groupsSnap.size > 1) throw new Error(`Target slug is not unique: ${targetSlug}`);
  const groupId = groupsSnap.docs[0].id;
  const groupData = groupsSnap.docs[0].data();
  console.log(`Target group: ${groupData.name ?? targetSlug} (${groupId})`);

  // Precise migrated-member cohort, from the Skool importer's own mapping
  // ledger — not a guess based on email domain or createdAt window.
  const mappingsSnap = await db
    .collection(`subAccounts/${subAccountId}/importMappings`)
    .where("system", "==", "skool")
    .where("entity", "==", "community_members")
    .get();

  console.log(`Skool community_members import mappings found: ${mappingsSnap.size}`);

  type MemberAuditRow = {
    memberId: string;
    skoolExternalId: string;
    email: string;
    displayName: string | null;
    memberDocExists: boolean;
    importedHistoricalOnly: boolean;
    contactId: string | null;
    contactExists: boolean | null;
    personId: string | null;
    hasPasswordHash: boolean;
    passwordUpdatedAt: string | null;
    createdAt: string | null;
    lastSeenAt: string | null;
    possiblyLoggedInSinceCreation: boolean; // lastSeenAt materially later than createdAt (heuristic, see report notes)
    passwordTokensIssued: number;
    passwordTokensUsed: number;
    lastTokenPurpose: "setup" | "reset" | null;
    lastTokenExpired: boolean | null;
    membershipStatus: string | null; // active/pending/removed, or null = no membership doc
    membershipRole: string | null;
    activationRecommendation: string;
  };

  const rows: MemberAuditRow[] = [];
  let processed = 0;
  for (const mapDoc of mappingsSnap.docs) {
    const mapping = mapDoc.data() as { leadstackId: string; externalId: string };
    const memberId = mapping.leadstackId;

    const [memberSnap, membershipSnap, tokensSnap] = await Promise.all([
      db.doc(`subAccounts/${subAccountId}/members/${memberId}`).get(),
      db
        .doc(`subAccounts/${subAccountId}/communityGroups/${groupId}/memberships/${memberId}`)
        .get(),
      db
        .collection(`subAccounts/${subAccountId}/memberPasswordTokens`)
        .where("memberId", "==", memberId)
        .get(),
    ]);

    if (!memberSnap.exists) {
      rows.push({
        memberId,
        skoolExternalId: mapping.externalId,
        email: "",
        displayName: null,
        memberDocExists: false,
        importedHistoricalOnly: false,
        contactId: null,
        contactExists: null,
        personId: null,
        hasPasswordHash: false,
        passwordUpdatedAt: null,
        createdAt: null,
        lastSeenAt: null,
        possiblyLoggedInSinceCreation: false,
        passwordTokensIssued: tokensSnap.size,
        passwordTokensUsed: tokensSnap.docs.filter((d) => !!d.data().usedAt).length,
        lastTokenPurpose: null,
        lastTokenExpired: null,
        membershipStatus: membershipSnap.exists ? (membershipSnap.data()?.status as string) : null,
        membershipRole: membershipSnap.exists ? (membershipSnap.data()?.role as string) : null,
        activationRecommendation: "ORPHAN MAPPING — importMappings points at a Member doc that no longer exists. Manual review required.",
      });
      processed++;
      continue;
    }

    const member = memberSnap.data()!; // guarded by the !memberSnap.exists branch above
    const contactId = (member.contactId as string | null) ?? null;
    let contactExists: boolean | null = null;
    if (contactId) {
      const contactSnap = await db.doc(`contacts/${contactId}`).get();
      contactExists = contactSnap.exists;
    }

    const createdAtMs = tsToMillis(member.createdAt);
    const lastSeenAtMs = tsToMillis(member.lastSeenAt);
    const possiblyLoggedIn =
      createdAtMs != null && lastSeenAtMs != null && lastSeenAtMs - createdAtMs > 5 * 60 * 1000;

    // Most-recent token by createdAt (tokens are 1h-lived; an old unused
    // token is NOT currently usable — only reported for visibility).
    const tokenDocs = tokensSnap.docs
      .map((d) => d.data() as { purpose: "setup" | "reset"; createdAt: unknown; expiresAt: unknown; usedAt: unknown })
      .sort((a, b) => (tsToMillis(b.createdAt) ?? 0) - (tsToMillis(a.createdAt) ?? 0));
    const lastToken = tokenDocs[0] ?? null;
    const lastTokenExpired = lastToken
      ? (tsToMillis(lastToken.expiresAt) ?? 0) < Date.now()
      : null;

    const hasPasswordHash = !!member.passwordHash;
    const importedHistoricalOnly = !!member.importedHistoricalOnly;

    let activationRecommendation: string;
    if (importedHistoricalOnly) {
      activationRecommendation = "Historical-author-only identity (no real email recovered) — no login possible, not eligible for the activation email.";
    } else if (!contactId || contactExists === false) {
      activationRecommendation = "Contact link missing or dangling — resolve identity before sending an activation email.";
    } else if (hasPasswordHash) {
      activationRecommendation = "Already has a Community password set — send the plain 'Access the community' link (no password-setup step needed), or skip entirely if lastSeenAt shows recent activity.";
    } else {
      activationRecommendation = "No password set yet — send the existing 'Set your password' email (sendMemberPasswordEmail, purpose='setup'), which lets them land authenticated without a Forgot-password detour.";
    }

    rows.push({
      memberId,
      skoolExternalId: mapping.externalId,
      email: (member.email as string) ?? "",
      displayName: (member.displayName as string | null) ?? null,
      memberDocExists: true,
      importedHistoricalOnly,
      contactId,
      contactExists,
      personId: (member.personId as string | null) ?? null,
      hasPasswordHash,
      passwordUpdatedAt: tsToIso(member.passwordUpdatedAt),
      createdAt: tsToIso(member.createdAt),
      lastSeenAt: tsToIso(member.lastSeenAt),
      possiblyLoggedInSinceCreation: possiblyLoggedIn,
      passwordTokensIssued: tokensSnap.size,
      passwordTokensUsed: tokensSnap.docs.filter((d) => !!d.data().usedAt).length,
      lastTokenPurpose: lastToken?.purpose ?? null,
      lastTokenExpired,
      membershipStatus: membershipSnap.exists ? (membershipSnap.data()?.status as string) : null,
      membershipRole: membershipSnap.exists ? (membershipSnap.data()?.role as string) : null,
      activationRecommendation,
    });

    processed++;
    if (processed % 15 === 0) console.log(`  ...processed ${processed}/${mappingsSnap.size}`);
  }

  // Also check for duplicate Contact linkage among migrated members (cross-
  // reference with the separate duplicate-contact-audit.ts output would be
  // more thorough; this is a same-script best-effort check by email).
  const byContactId = new Map<string, string[]>();
  for (const r of rows) {
    if (!r.contactId) continue;
    const list = byContactId.get(r.contactId) ?? [];
    list.push(r.memberId);
    byContactId.set(r.contactId, list);
  }
  const sharedContacts = Array.from(byContactId.entries()).filter(([, ids]) => ids.length > 1);

  const summary = {
    totalMigratedMembers: rows.length,
    membersWithContact: rows.filter((r) => !!r.contactId).length,
    membersWithDanglingContact: rows.filter((r) => r.contactId && r.contactExists === false).length,
    membersWithMemberDoc: rows.filter((r) => r.memberDocExists).length,
    membersWithAuthUser: 0, // architectural fact: Community Members are never Firebase Auth users (magic-link/session-token model, see member-auth.ts)
    membersEverLoggedIn_heuristic: rows.filter((r) => r.possiblyLoggedInSinceCreation).length,
    membersNeverActivated_noPassword: rows.filter((r) => r.memberDocExists && !r.importedHistoricalOnly && !r.hasPasswordHash).length,
    membersAlreadyHavePassword: rows.filter((r) => r.hasPasswordHash).length,
    membersMissingAuthIdentity: rows.filter((r) => r.memberDocExists && !r.importedHistoricalOnly && !r.hasPasswordHash).length,
    membersWithDuplicateContactLinkage: sharedContacts.length,
    historicalAuthorOnly_notEligible: rows.filter((r) => r.importedHistoricalOnly).length,
    orphanMappings: rows.filter((r) => !r.memberDocExists).length,
    membershipStatusBreakdown: rows.reduce<Record<string, number>>((acc, r) => {
      const key = r.membershipStatus ?? "no-membership-doc";
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {}),
    anyPasswordEmailEverIssued: rows.filter((r) => r.passwordTokensIssued > 0).length,
  };

  console.log("\n=== SUMMARY ===");
  console.log(JSON.stringify(summary, null, 2));

  const outFile = process.env.OUT_FILE ?? "/tmp/member-activation-audit.json";
  writeFileSync(
    outFile,
    JSON.stringify({ subAccountId, groupId, targetSlug, summary, sharedContacts, rows }, null, 2),
  );
  console.log(`\nFull report written to ${outFile}`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
