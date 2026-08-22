import "server-only";

import { getAdminDb } from "@/lib/firebase/admin";
import type { SkoolMentionResolver } from "./mapping";

/**
 * Builds the Skool user id -> real Magnetix Member resolver used to
 * correctly convert `[@Name](obj://user/<id>)` mentions during import (and,
 * identically, during the historical content repair — see
 * scripts/skool-repair-mentions.ts). Reuses the SAME
 * `memberLeadstackIdBySkoolUserId` map `importer.ts`'s own member loop (§3)
 * already builds — never a separate/parallel lookup — plus one bulk read
 * of those Members' real `displayName`s (never the raw Skool label; a
 * mention should read exactly like one a member typed by hand in Magnetix
 * today, which means it shows the CURRENT Magnetix display name, not a
 * frozen Skool-time snapshot).
 *
 * Skips any `"__would_create__"` placeholder id (the dry-run projection
 * pattern used throughout importer.ts) — a member that doesn't exist yet
 * has no real Member doc to read a displayName from, so a mention
 * targeting them correctly falls back to plain text during a dry run and
 * only resolves once the run actually commits and that Member is real.
 */
export async function buildMentionResolver(
  subAccountId: string,
  memberLeadstackIdBySkoolUserId: Map<string, string>,
): Promise<SkoolMentionResolver> {
  const db = getAdminDb();
  const entries = [...memberLeadstackIdBySkoolUserId.entries()].filter(
    ([, id]) => id && id !== "__would_create__",
  );
  const resolver: SkoolMentionResolver = new Map();
  if (entries.length === 0) return resolver;

  const refs = entries.map(([, memberId]) => db.doc(`subAccounts/${subAccountId}/members/${memberId}`));
  const snaps = await db.getAll(...refs);
  entries.forEach(([skoolUserId, memberId], i) => {
    const data = snaps[i].data();
    if (data) {
      resolver.set(skoolUserId, { memberId, displayName: (data.displayName as string | null) || "Member" });
    }
  });
  return resolver;
}
