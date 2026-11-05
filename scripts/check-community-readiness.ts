/**
 * Community pre-activation readiness (2026-11-05) — deterministic checks.
 *
 * Offline: every member Classroom route has a staff (CRM) twin, so a staff
 * catalog link can never fall through to another dynamic route; the lesson
 * pin queries need no composite index; no ±1 memberCount increments remain.
 * Emulator (FIRESTORE_EMULATOR_HOST + GCLOUD_PROJECT=demo-*): memberCount
 * repair + join / remove / ban / re-activate / duplicate join keep the cache
 * equal to the active-membership count; lesson pins come back oldest first;
 * open vs purchase course entitlement.
 *
 * Run: pnpm check:community-readiness
 */
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

let passed = 0;
async function check(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    passed++;
  } catch (err) {
    console.error(`✗ ${name}`);
    throw err;
  }
}
const ROOT = new URL("..", import.meta.url).pathname;

function pageRoutes(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const name of readdirSync(d)) {
      const p = join(d, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (name === "page.tsx") out.push(relative(dir, d) || ".");
    }
  };
  walk(dir);
  return out.sort();
}

async function offline() {
  await check("every member Classroom route has a staff twin", () => {
    const member = pageRoutes(join(ROOT, "src/app/c/[saId]/[groupSlug]/classroom"));
    const staff = pageRoutes(join(ROOT, "src/app/(immersive)/sa/[subAccountId]/community/[groupId]/classroom"));
    assert.ok(member.includes("product/[courseId]"));
    for (const r of member) assert.ok(staff.includes(r), `staff route missing: classroom/${r}`);
  });
  await check("staff product course page exists and uses the shared component + staff access", () => {
    const p = join(ROOT, "src/app/(immersive)/sa/[subAccountId]/community/[groupId]/classroom/product/[courseId]/page.tsx");
    assert.ok(existsSync(p));
    const s = readFileSync(p, "utf8");
    assert.ok(s.includes("requireStaffGroupPageAccess") && s.includes("EmbeddedProductCourse") && s.includes("staffGroupId: groupId"));
  });
  await check("lesson pin queries need no composite index", () => {
    const s = readFileSync(join(ROOT, "src/lib/server/community-course-pins-service.ts"), "utf8");
    const lessonQueries = s.split(/where\("lessonId"/).slice(1).map((chunk) => chunk.slice(0, 200));
    assert.ok(lessonQueries.length >= 1);
    for (const q of lessonQueries) assert.ok(!q.includes("orderBy"), "orderBy next to a lessonId filter");
  });
  await check("no ±1 memberCount increments left on tenant communities", () => {
    for (const f of ["community-service.ts", "community-purchase-service.ts", "contact-access-service.ts", "standalone-course-service.ts", "skool-import/importer.ts"]) {
      const s = readFileSync(join(ROOT, "src/lib/server", f), "utf8");
      assert.ok(!/memberCount:\s*FieldValue\.increment/.test(s), f);
    }
  });
}

async function emulator() {
  const { initializeApp, getApps } = await import("firebase-admin/app");
  if (!getApps().length) initializeApp({ projectId: process.env.GCLOUD_PROJECT });
  const { getAdminDb } = await import("../src/lib/firebase/admin");
  const count = await import("../src/lib/server/community-member-count");
  const community = await import("../src/lib/server/community-service");
  const pins = await import("../src/lib/server/community-course-pins-service");
  const access = await import("../src/lib/standalone-courses/course-access");
  const db = getAdminDb();
  const SA = `sa_ready_${Date.now()}`, G = "g1";
  const gref = db.doc(`subAccounts/${SA}/communityGroups/${G}`);
  const cached = async () => (await gref.get()).data()!.memberCount as number;
  try {
    await db.doc(`subAccounts/${SA}`).set({ name: "Readiness", agencyId: "ag" });
    await gref.set({ subAccountId: SA, agencyId: "ag", name: "Circle", slug: "circle", status: "published", access: "free", joinPolicy: "open", memberCount: 72 });
    for (let i = 0; i < 5; i++) {
      await db.doc(`subAccounts/${SA}/members/m${i}`).set({ subAccountId: SA, agencyId: "ag", email: `m${i}@example.com`, status: "active", displayName: `M ${i}`, contactId: null });
      await gref.collection("memberships").doc(`m${i}`).set({ memberId: `m${i}`, status: i < 3 ? "active" : "removed", role: "member", level: 1, points: 0 });
    }
    await check("stale cache (72) is repaired to the active count (3), writing only memberCount", async () => {
      const before = Object.keys((await gref.get()).data()!).sort();
      assert.equal(await count.syncGroupMemberCount(SA, G), 3);
      assert.equal(await cached(), 3);
      assert.deepEqual(Object.keys((await gref.get()).data()!).sort(), before, "no new fields on the group doc");
    });
    await check("group doc stays plain for Client Components (no Timestamp/class values after sync)", async () => {
      const data = (await gref.get()).data()!;
      for (const [k, v] of Object.entries(data)) {
        if (k === "createdAt" || k === "updatedAt") continue;
        assert.ok(v === null || typeof v !== "object" || Array.isArray(v) || Object.getPrototypeOf(v) === Object.prototype, `non-plain field ${k}`);
      }
    });
    await check("join, duplicate join, remove, ban and re-activate keep cache == active count", async () => {
      await db.doc(`subAccounts/${SA}/members/new`).set({ subAccountId: SA, agencyId: "ag", email: "new@example.com", status: "active", displayName: "New", contactId: null });
      await community.joinGroupServerSide({ subAccountId: SA, agencyId: "ag", groupId: G, memberId: "new" });
      assert.equal(await cached(), 4);
      await community.joinGroupServerSide({ subAccountId: SA, agencyId: "ag", groupId: G, memberId: "new" });
      assert.equal(await cached(), 4, "duplicate join doesn't double count");
      await community.setMembershipStatusServerSide({ subAccountId: SA, groupId: G, memberId: "m0", status: "removed" });
      assert.equal(await cached(), 3);
      await community.setMembershipStatusServerSide({ subAccountId: SA, groupId: G, memberId: "m1", status: "banned" });
      assert.equal(await cached(), 2);
      await community.setMembershipStatusServerSide({ subAccountId: SA, groupId: G, memberId: "m0", status: "active" });
      assert.equal(await cached(), 3);
      assert.equal(await cached(), await count.countActiveGroupMembers(SA, G));
    });
    await check("lesson pins come back oldest first", async () => {
      const { Timestamp } = await import("firebase-admin/firestore");
      const col = gref.collection("coursePagePins");
      await col.doc("b").set({ postId: "p2", courseId: "c1", lessonId: "l1", createdAt: Timestamp.fromMillis(2000) });
      await col.doc("a").set({ postId: "p1", courseId: "c1", lessonId: "l1", createdAt: Timestamp.fromMillis(1000) });
      await col.doc("z").set({ postId: "p9", courseId: "c1", lessonId: "other", createdAt: Timestamp.fromMillis(500) });
      assert.deepEqual(await pins.listPostIdsPinnedToLesson({ subAccountId: SA, groupId: G, courseId: "c1", lessonId: "l1" }), ["p1", "p2"]);
    });
    await check("course entitlement: open → member can open; purchase without payment → locked", async () => {
      const base = { subAccountId: SA, id: "course1", linkedCommunityGroupIds: [G], published: true } as never;
      assert.equal(await access.checkStandaloneCourseEntitlementForMember({ ...(base as object), access: "open" } as never, "m2"), true);
      assert.equal(await access.checkStandaloneCourseEntitlementForMember({ ...(base as object), access: "purchase" } as never, "m2"), false);
    });
  } finally {
    await db.recursiveDelete(db.doc(`subAccounts/${SA}`));
  }
}

async function main() {
  await offline();
  const emu = process.env.FIRESTORE_EMULATOR_HOST && process.env.GCLOUD_PROJECT?.startsWith("demo-");
  if (emu) await emulator();
  console.log(`Community readiness checks: ${passed} passed${emu ? " (incl. emulator)" : " (offline; set the emulator env for persistence)"}`);
}
main().catch((err) => {
  console.error(err);
  process.exit(1);
});
