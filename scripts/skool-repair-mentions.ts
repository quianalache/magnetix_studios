/**
 * Skool @mention content-fidelity repair — a ONE-OFF, targeted correction
 * for content already imported BEFORE the mapping.ts fix existed (see
 * skool-mention-fix-tests.ts for the fix itself). Reused nothing new: the
 * SAME `convertSkoolMentions` transform the importer now runs at import
 * time, applied here directly to the already-stored `body` HTML instead of
 * raw Skool markdown (the stored HTML already carries the unconverted
 * `[@Name](obj://user/<id>)` text untouched, since the OLD converter's
 * link regex only ever matched `https?://` and silently skipped it).
 *
 * Safety, every one of these structurally enforced, not just checked:
 *  - touches ONLY docs reached via the real Magnetic Visibility group's
 *    own collection path (TARGET_GROUP_ID below) — never a cross-group or
 *    cross-tenant query
 *  - touches ONLY docs with a real `system:"skool"` community_posts/
 *    community_comments importMappings entry — a post/comment with no
 *    such mapping is left alone, never guessed to be Skool-imported
 *  - writes ONLY the `body` field — a plain `.update({ body })`, so every
 *    other field (author, channel/category, attachments, pinned,
 *    commentsDisabled, createdAt, updatedAt) is structurally untouched,
 *    not merely "preserved by care"
 *  - a direct Admin-SDK `.update()`, the same pattern the importer itself
 *    always used — never routed through createPostServerSide/
 *    createCommentServerSide or any live write-triggering service
 *    function, so there is no code path here that could fire a
 *    notification/workflow/gamification/unread event
 *  - dry-run by default; only --commit performs real writes
 *
 * Usage:
 *   npx tsx --conditions=react-server scripts/skool-repair-mentions.ts
 *   npx tsx --conditions=react-server scripts/skool-repair-mentions.ts --commit
 */
import fs from "node:fs";
import path from "node:path";

function loadEnvLocal() {
  const file = path.resolve(process.cwd(), ".env.local");
  const text = fs.readFileSync(file, "utf8");
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}
loadEnvLocal();

import { getAdminDb } from "@/lib/firebase/admin";
import { convertSkoolMentions, type SkoolMentionResolver } from "@/lib/server/skool-import/mapping";
import type { ImportMappingDoc } from "@/types/import";

const SUB_ACCOUNT_ID = "xvnedVCmQpEvHrcPhEDI";
const TARGET_GROUP_ID = "TBp39lWSZJCtLguowmqB"; // the real "Magnetic Visibility" group -- hardcoded, never derived from a query

async function main() {
  const args = process.argv.slice(2);
  const commit = args.includes("--commit");
  console.log(`\n=== Skool mention repair: ${commit ? "COMMIT (real writes)" : "DRY RUN (zero writes)"} ===`);

  const db = getAdminDb();
  const mappingsCol = db.collection(`subAccounts/${SUB_ACCOUNT_ID}/importMappings`);

  // Build the mention resolver from the SAME community_members provenance
  // every other entity uses -- not a live Skool re-extraction. Works
  // identically for active and historical-author Members (both get a real
  // mapping entry at import time).
  const memberMappingsSnap = await mappingsCol
    .where("system", "==", "skool")
    .where("entity", "==", "community_members")
    .get();
  const memberLeadstackIdBySkoolUserId = new Map<string, string>();
  memberMappingsSnap.docs.forEach((d) => {
    const data = d.data() as ImportMappingDoc;
    memberLeadstackIdBySkoolUserId.set(data.externalId, data.leadstackId);
  });
  console.log(`  ${memberLeadstackIdBySkoolUserId.size} Skool member mappings found.`);

  const memberIds = [...memberLeadstackIdBySkoolUserId.values()];
  const memberRefs = memberIds.map((id) => db.doc(`subAccounts/${SUB_ACCOUNT_ID}/members/${id}`));
  const memberSnaps = memberRefs.length > 0 ? await db.getAll(...memberRefs) : [];
  const mentionResolver: SkoolMentionResolver = new Map();
  let i = 0;
  for (const [skoolUserId, memberId] of memberLeadstackIdBySkoolUserId.entries()) {
    const data = memberSnaps[i]?.data();
    i += 1;
    if (data) mentionResolver.set(skoolUserId, { memberId, displayName: (data.displayName as string | null) || "Member" });
  }
  console.log(`  ${mentionResolver.size} resolvable to a real Member doc.`);

  // ONLY posts/comments with a real system:"skool" mapping entry.
  const postMappingsSnap = await mappingsCol.where("system", "==", "skool").where("entity", "==", "community_posts").get();
  const commentMappingsSnap = await mappingsCol.where("system", "==", "skool").where("entity", "==", "community_comments").get();
  console.log(`  ${postMappingsSnap.size} community_posts mappings, ${commentMappingsSnap.size} community_comments mappings.`);

  const mentionPattern = /\[([^\]]*)\]\(obj:\/\/[^)]*\)/;

  let postsAffected = 0;
  let postsOccurrences = 0;
  let postsResolvable = 0;
  let postsFallback = 0;
  const postUpdates: { ref: FirebaseFirestore.DocumentReference; before: string; after: string }[] = [];

  for (const d of postMappingsSnap.docs) {
    const data = d.data() as ImportMappingDoc;
    const ref = db.doc(`subAccounts/${SUB_ACCOUNT_ID}/communityGroups/${TARGET_GROUP_ID}/posts/${data.leadstackId}`);
    const snap = await ref.get();
    if (!snap.exists) continue; // referenced doc no longer exists -- skip, never guess
    const body = snap.data()!.body as string;
    if (!mentionPattern.test(body)) continue;
    const occurrences = [...body.matchAll(/\[([^\]]*)\]\(obj:\/\/([^)]*)\)/g)];
    postsOccurrences += occurrences.length;
    for (const [, , objPath] of occurrences) {
      const idMatch = /^user\/([a-zA-Z0-9]+)$/.exec(objPath);
      if (idMatch && mentionResolver.has(idMatch[1])) postsResolvable += 1;
      else postsFallback += 1;
    }
    const after = convertSkoolMentions(body, mentionResolver);
    if (after !== body) {
      postsAffected += 1;
      postUpdates.push({ ref, before: body, after });
    }
  }

  let commentsAffected = 0;
  let commentsOccurrences = 0;
  let commentsResolvable = 0;
  let commentsFallback = 0;
  const commentUpdates: { ref: FirebaseFirestore.DocumentReference; before: string; after: string }[] = [];

  for (const d of commentMappingsSnap.docs) {
    const data = d.data() as ImportMappingDoc;
    if (!data.parentId) continue; // a comment mapping with no recorded parent post -- can't safely locate it, skip
    const ref = db.doc(
      `subAccounts/${SUB_ACCOUNT_ID}/communityGroups/${TARGET_GROUP_ID}/posts/${data.parentId}/comments/${data.leadstackId}`,
    );
    const snap = await ref.get();
    if (!snap.exists) continue;
    const body = snap.data()!.body as string;
    if (!mentionPattern.test(body)) continue;
    const occurrences = [...body.matchAll(/\[([^\]]*)\]\(obj:\/\/([^)]*)\)/g)];
    commentsOccurrences += occurrences.length;
    for (const [, , objPath] of occurrences) {
      const idMatch = /^user\/([a-zA-Z0-9]+)$/.exec(objPath);
      if (idMatch && mentionResolver.has(idMatch[1])) commentsResolvable += 1;
      else commentsFallback += 1;
    }
    const after = convertSkoolMentions(body, mentionResolver);
    if (after !== body) {
      commentsAffected += 1;
      commentUpdates.push({ ref, before: body, after });
    }
  }

  console.log("\n=== REPORT ===");
  console.log(
    JSON.stringify(
      {
        commit,
        posts: { affected: postsAffected, occurrences: postsOccurrences, resolvable: postsResolvable, fallback: postsFallback },
        comments: {
          affected: commentsAffected,
          occurrences: commentsOccurrences,
          resolvable: commentsResolvable,
          fallback: commentsFallback,
        },
        totalOccurrences: postsOccurrences + commentsOccurrences,
        totalResolvable: postsResolvable + commentsResolvable,
        totalFallback: postsFallback + commentsFallback,
      },
      null,
      2,
    ),
  );

  if (!commit) {
    console.log("\nSample of what would change (first 3 posts, first 3 comments):");
    for (const u of postUpdates.slice(0, 3)) console.log(`  POST ${u.ref.id}:\n    before: ${u.before.slice(0, 200)}\n    after:  ${u.after.slice(0, 200)}`);
    for (const u of commentUpdates.slice(0, 3)) console.log(`  COMMENT ${u.ref.id}:\n    before: ${u.before.slice(0, 200)}\n    after:  ${u.after.slice(0, 200)}`);
    console.log("\nDry run only -- zero writes performed. Re-run with --commit to apply.");
    process.exit(0);
  }

  console.log(`\nApplying ${postUpdates.length} post + ${commentUpdates.length} comment updates (body field ONLY)...`);
  let written = 0;
  for (const u of [...postUpdates, ...commentUpdates]) {
    await u.ref.update({ body: u.after });
    written += 1;
  }
  console.log(`Done. ${written} docs updated.`);
  process.exit(0);
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
