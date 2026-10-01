/**
 * Course playback + progression — regression checks for the three course
 * settings that must stay distinct:
 *   - "Autoplay lesson videos"        (video starts on load — previews too)
 *   - "Automatically play first lesson" (learning-entry opens first lesson)
 *   - "Automatically play next lesson"  (completion advances to next lesson)
 *
 * EMULATOR ONLY (Firestore + Auth, `demo-*` project, no production
 * credentials, no Bunny API calls). Runs the REAL preview-video route
 * handlers through their consolidated dispatchers, the real course tree +
 * enrollment filters, and the shared navigation rules.
 *
 * Run:
 *   echo '{"emulators":{"auth":{"port":9099},"firestore":{"port":8080},"ui":{"enabled":false}}}' > /tmp/emu/firebase.json
 *   BUNNY_STREAM_TOKEN_KEY=test-token-key firebase emulators:exec --config /tmp/emu/firebase.json \
 *     --only firestore,auth --project demo-course-progression \
 *     "NODE_OPTIONS='--require ./scripts/_server-only-shim.cjs' ./node_modules/.bin/tsx scripts/check-course-playback-progression.ts"
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { viaDispatcher } from "./_via-dispatcher";
import {
  COURSE_ENTRY_PARAM,
  autoAdvanceEnabled,
  courseEntryHref,
  isCourseEntryRequest,
  lessonToAdvanceTo,
  nextAvailableLessonId,
  orderLessonsByCurriculum,
  resolveCourseEntryLessonId,
} from "../src/lib/standalone-courses/course-navigation";
import { applyLessonVideoAutoplay } from "../src/lib/standalone-courses/lesson-video";
import { embedUrlFor } from "../src/lib/community/video-embed";

const PROJECT = process.env.GCLOUD_PROJECT || "demo-course-progression";
process.env.BUNNY_STREAM_TOKEN_KEY ||= "test-token-key";
initializeApp({ projectId: PROJECT });
const db = getFirestore();
db.settings({ ignoreUndefinedProperties: true });
const auth = getAuth();

const AG = "ag1";
const SA = "sa1";
const SA2 = "sa2";

let passes = 0;
let failures = 0;
async function check(label: string, fn: () => Promise<void> | void) {
  try {
    await fn();
    passes++;
    console.log(`PASS  ${label}`);
  } catch (err) {
    failures++;
    console.log(`FAIL  ${label} — ${(err as Error).message}`);
  }
}
const req = (uid: string, url: string) =>
  new Request(url, { headers: { "x-user-uid": uid, "x-user-email": `${uid}@example.test` } });
const src = (p: string) => readFileSync(p, "utf8");

const video = (scope: { kind: "tenant" | "agency"; subAccountId?: string }, guid: string) => ({
  agencyId: AG,
  subAccountId: scope.subAccountId ?? null,
  ownerScope: scope.kind === "tenant" ? { kind: "tenant", agencyId: AG, subAccountId: scope.subAccountId } : { kind: "agency", agencyId: AG },
  mediaType: "video",
  storage: { provider: "bunny", key: guid, bucket: null, mimeType: "video/mp4", fileSizeBytes: 1 },
  status: "ready",
  bunny: { libraryId: "lib1", videoGuid: guid, lifecycleStatus: "ready", deletedAt: null },
  references: [],
  deletedAt: null,
  createdAt: Timestamp.now(),
});
const lesson = (id: string, o: Record<string, unknown>) => ({
  title: id, order: 0, published: true, sectionId: null, videoUrl: null, videoProvider: null, videoId: null,
  hostedVideoId: null, bodyHtml: "", resourceLinks: [], chartUnlockCondition: null, ...o,
});

async function seed() {
  for (const [uid, agencyRole, agencyId] of [["admin1", null, AG], ["owner1", "owner", AG], ["outsider", null, "ag2"]] as const) {
    await auth.createUser({ uid, email: `${uid}@example.test` });
    await auth.setCustomUserClaims(uid, { status: "active", agencyId, agencyRole });
    await db.doc(`users/${uid}`).set({ status: "active" });
  }
  const w = (p: string, d: Record<string, unknown>) => db.doc(p).set(d);
  await w(`subAccounts/${SA}`, { agencyId: AG, name: "Studio", standaloneCoursesEnabledByAgency: true });
  await w(`subAccounts/${SA2}`, { agencyId: "ag2", name: "Other", standaloneCoursesEnabledByAgency: true });
  await w(`subAccounts/${SA}/subAccountMembers/admin1`, { status: "active", role: "admin" });
  await w(`subAccounts/${SA2}/subAccountMembers/outsider`, { status: "active", role: "admin" });
  await w(`subAccounts/${SA}/mediaAssets/v1`, video({ kind: "tenant", subAccountId: SA }, "guid-v1"));
  await w(`agencies/${AG}/mediaAssets/av1`, video({ kind: "agency" }, "guid-av1"));

  // Three tenant courses: autoplay off (explicit), on, and legacy (no field).
  const le = (o: Record<string, unknown>) => ({ autoplayNextLesson: true, autoplayFirstLesson: true, autoCompleteLessons: true, ...o });
  for (const [id, learningExperience] of [
    ["cOff", le({ autoplayLessonVideos: false })],
    ["cOn", le({ autoplayLessonVideos: true })],
    ["cLegacy", le({})],
  ] as const) {
    await w(`subAccounts/${SA}/standaloneCourses/${id}`, { title: id, published: true, agencyId: AG, learningExperience });
    await w(`subAccounts/${SA}/standaloneCourses/${id}/lessons/l1`, lesson("l1", { hostedVideoId: "v1", order: 0 }));
    await w(`subAccounts/${SA}/standaloneCourses/${id}/lessons/yt`, lesson("yt", { videoProvider: "youtube", videoId: "dQw4w9WgXcQ", order: 1 }));
  }
  for (const [id, auto] of [["acOff", false], ["acOn", true]] as const) {
    await w(`agencies/${AG}/standaloneCourses/${id}`, { title: id, published: true, agencyId: AG, learningExperience: le({ autoplayLessonVideos: auto }) });
    await w(`agencies/${AG}/standaloneCourses/${id}/lessons/l1`, lesson("l1", { hostedVideoId: "av1", order: 0 }));
  }

  // Curriculum course for entry/next rules. Section B is displayed FIRST
  // even though its lessons have higher `order` values (sections were
  // reordered after the lessons were created). Includes an unpublished and
  // a chart-gated lesson that must never be chosen.
  await w(`subAccounts/${SA}/standaloneCourses/cNav`, { title: "Nav", published: true, agencyId: AG, learningExperience: le({}) });
  await w(`subAccounts/${SA}/standaloneCourses/cNav/sections/sA`, { title: "Second shown", order: 1 });
  await w(`subAccounts/${SA}/standaloneCourses/cNav/sections/sB`, { title: "First shown", order: 0 });
  await w(`subAccounts/${SA}/standaloneCourses/cNav/lessons/a1`, lesson("a1", { sectionId: "sA", order: 0 }));
  await w(`subAccounts/${SA}/standaloneCourses/cNav/lessons/a2`, lesson("a2", { sectionId: "sA", order: 1 }));
  await w(`subAccounts/${SA}/standaloneCourses/cNav/lessons/bDraft`, lesson("bDraft", { sectionId: "sB", order: 2, published: false }));
  await w(`subAccounts/${SA}/standaloneCourses/cNav/lessons/bGated`, lesson("bGated", { sectionId: "sB", order: 3, chartUnlockCondition: { attribute: "type", operator: "equals", value: "Projector" } }));
  await w(`subAccounts/${SA}/standaloneCourses/cNav/lessons/b1`, lesson("b1", { sectionId: "sB", order: 4 }));
  await w(`subAccounts/${SA}/standaloneCourses/cNav/lessons/loose`, lesson("loose", { sectionId: null, order: 5 }));
}

async function main() {
  await seed();
  const tenantPreview = viaDispatcher(await import("../src/app/api/sub-accounts/[id]/standalone-courses/[[...path]]/route"), "[courseId]/preview-video");
  const agencyPreview = viaDispatcher(await import("../src/app/api/agency/standalone-courses/[[...path]]/route"), "[courseId]/preview-video");
  const { getStandaloneCourseTree, filterLessonsForEnrollment } = await import("../src/lib/server/standalone-course-service");

  const preview = async (courseId: string, lessonId: string, uid = "admin1", sa = SA) => {
    const res = await tenantPreview.GET(req(uid, `http://t.local/x?lessonId=${lessonId}`), { params: Promise.resolve({ id: sa, courseId }) });
    return { status: res.status, body: (await res.json()) as { embedUrl?: string | null } };
  };
  const agencyPreviewUrl = async (courseId: string) => {
    const res = await agencyPreview.GET(req("owner1", "http://t.local/x?lessonId=l1"), { params: Promise.resolve({ courseId }) });
    assert.equal(res.status, 200);
    return new URL(((await res.json()) as { embedUrl: string }).embedUrl);
  };
  const signatureValid = (u: URL, guid: string) =>
    createHash("sha256").update(`test-token-key${guid}${u.searchParams.get("expires")}`).digest("hex") === u.searchParams.get("token");

  // ── A/B/C: editor (Theme Builder / Course Editor) Bunny preview ─────────
  await check("A. editor Bunny preview, autoplay OFF → autoplay=false, still a signed 5-minute URL", async () => {
    const { status, body } = await preview("cOff", "l1");
    assert.equal(status, 200);
    const u = new URL(body.embedUrl!);
    assert.equal(u.hostname, "iframe.mediadelivery.net");
    assert.equal(u.searchParams.get("autoplay"), "false");
    assert.ok(signatureValid(u, "guid-v1"), "signature verifies");
    const ttl = Number(u.searchParams.get("expires")) - Math.floor(Date.now() / 1000);
    assert.ok(ttl > 0 && ttl <= 300, `ttl ${ttl}`);
  });
  await check("B. editor Bunny preview, autoplay ON → autoplay=true", async () => {
    assert.equal(new URL((await preview("cOn", "l1")).body.embedUrl!).searchParams.get("autoplay"), "true");
  });
  await check("C. no saved autoplay preference → OFF (even though first/next are saved ON)", async () => {
    assert.equal(new URL((await preview("cLegacy", "l1")).body.embedUrl!).searchParams.get("autoplay"), "false");
  });
  await check("N. Agency editor preview follows the same rule (OFF / ON)", async () => {
    assert.equal((await agencyPreviewUrl("acOff")).searchParams.get("autoplay"), "false");
    const on = await agencyPreviewUrl("acOn");
    assert.equal(on.searchParams.get("autoplay"), "true");
    assert.ok(signatureValid(on, "guid-av1"));
  });
  await check("M. Bunny preview stays authorized: another tenant's admin is refused, no URL", async () => {
    const { status, body } = await preview("cOff", "l1", "outsider", SA);
    assert.ok(status === 401 || status === 403, `status ${status}`);
    assert.equal(body.embedUrl, undefined);
  });
  await check("L. external YouTube lesson: preview route returns no Bunny URL; external embed unchanged when off, provider param when on", async () => {
    assert.equal((await preview("cOff", "yt")).body.embedUrl, null);
    const yt = embedUrlFor("youtube", "dQw4w9WgXcQ")!;
    assert.equal(applyLessonVideoAutoplay(yt, false), yt);
    assert.equal(new URL(applyLessonVideoAutoplay(yt, true)).searchParams.get("autoplay"), "1");
  });

  // ── Real tree + enrollment filter feeding the shared navigation rules ──
  const tree = (await getStandaloneCourseTree({ subAccountId: SA, courseId: "cNav", includeUnpublished: false }))!;
  const available = filterLessonsForEnrollment(tree.lessons, null); // no birth chart → gated lesson hidden
  const ordered = orderLessonsByCurriculum(tree.sections, available).map((l) => l.id);

  await check("I. restricted lessons are never candidates (unpublished + chart-gated filtered out)", () => {
    assert.deepEqual(ordered, ["b1", "a1", "a2", "loose"]);
  });
  await check("D. first-lesson OFF → entry renders the homepage", () => {
    assert.equal(resolveCourseEntryLessonId({ isEntry: true, learningExperience: { autoplayFirstLesson: false }, sections: tree.sections, availableLessons: available }), null);
  });
  await check("E. first-lesson ON + learning-entry → first AVAILABLE lesson in curriculum order", () => {
    assert.equal(resolveCourseEntryLessonId({ isEntry: true, learningExperience: tree.course.learningExperience, sections: tree.sections, availableLessons: available }), "b1");
  });
  await check("F. direct homepage URL (no entry flag) stays the homepage even with first-lesson ON", () => {
    assert.equal(resolveCourseEntryLessonId({ isEntry: false, learningExperience: { autoplayFirstLesson: true }, sections: tree.sections, availableLessons: available }), null);
    assert.equal(isCourseEntryRequest({}), false);
    assert.equal(isCourseEntryRequest({ [COURSE_ENTRY_PARAM]: "1" }), true);
    assert.equal(courseEntryHref("/course/s/c/classroom"), "/course/s/c/classroom?enter=1");
    assert.equal(courseEntryHref("/x?a=1"), "/x?a=1&enter=1");
  });
  await check("first-lesson ON with no available lesson → homepage, never a locked lesson", () => {
    assert.equal(resolveCourseEntryLessonId({ isEntry: true, learningExperience: { autoplayFirstLesson: true }, sections: tree.sections, availableLessons: [] }), null);
  });
  await check("G. next-lesson OFF → completion never navigates", () => {
    assert.equal(lessonToAdvanceTo({ autoAdvance: autoAdvanceEnabled({ autoplayNextLesson: false }), alreadyAdvanced: false, orderedLessonIds: ordered, completedLessonId: "b1" }), null);
  });
  await check("H. next-lesson ON → completion advances to the next available lesson (crosses sections in display order)", () => {
    assert.equal(lessonToAdvanceTo({ autoAdvance: autoAdvanceEnabled(tree.course.learningExperience), alreadyAdvanced: false, orderedLessonIds: ordered, completedLessonId: "b1" }), "a1");
    assert.equal(nextAvailableLessonId(ordered, "a2"), "loose");
  });
  await check("J. a repeated completion event for the same lesson does not navigate again", () => {
    assert.equal(lessonToAdvanceTo({ autoAdvance: true, alreadyAdvanced: true, orderedLessonIds: ordered, completedLessonId: "b1" }), null);
  });
  await check("K. end of course → stays on the current lesson", () => {
    assert.equal(lessonToAdvanceTo({ autoAdvance: true, alreadyAdvanced: false, orderedLessonIds: ordered, completedLessonId: "loose" }), null);
  });
  await check("absent settings never switch a behavior on", () => {
    assert.equal(autoAdvanceEnabled(undefined), false);
    assert.equal(resolveCourseEntryLessonId({ isEntry: true, learningExperience: null, sections: [], availableLessons: [{ id: "x", sectionId: null }] }), null);
  });

  // ── Wiring: every real surface uses the shared rules (no competing renderers) ──
  const lessonSurfaces = [
    "src/app/course/[saId]/[courseId]/classroom/[lessonId]/page.tsx",
    "src/app/course/agency/[courseId]/classroom/[lessonId]/page.tsx",
    "src/components/community/classroom/embedded-product-lesson.tsx",
    "src/app/my/community/[groupId]/classroom/product/[courseId]/[lessonId]/page.tsx",
    "src/app/(agency-immersive)/agency/community/[groupId]/classroom/product/[courseId]/[lessonId]/page.tsx",
  ];
  await check("N/O. every lesson surface (tenant, Agency, Community tenant + Agency) passes the next-lesson setting", () => {
    for (const p of lessonSurfaces) assert.match(src(p), /autoAdvanceToNextLesson=\{autoAdvanceEnabled\(/, p);
  });
  const homepages = [
    "src/app/course/[saId]/[courseId]/classroom/page.tsx",
    "src/app/course/agency/[courseId]/classroom/page.tsx",
    "src/components/community/classroom/embedded-product-course.tsx",
    "src/components/community/classroom/embedded-agency-product-course.tsx",
    "src/app/(agency-immersive)/agency/community/[groupId]/classroom/product/[courseId]/page.tsx",
  ];
  await check("N/O. every course homepage (standalone + Community, tenant + Agency) applies the shared entry rule", () => {
    for (const p of homepages) assert.match(src(p), /resolveCourseEntryLessonId\(/, p);
  });
  await check("O. Community catalog cards + custom-domain mirror carry the entry flag", () => {
    assert.match(src("src/lib/server/classroom-catalog-service.ts"), /courseEntryHref\(\s*communityLearningProductHref/);
    assert.match(src("src/lib/server/agency-community-classroom-service.ts"), /courseEntryHref\(communityLearningProductHref/);
    assert.match(src("src/app/communities/[groupSlug]/learning/product/[courseId]/page.tsx"), /searchParams,\n\s*\}\);/);
  });
  await check("advance happens only after a successful Mark Complete response (not on load/play)", () => {
    const player = src("src/components/standalone-courses/standalone-lesson-player.tsx");
    const body = player.slice(player.indexOf("async function markComplete"), player.indexOf("const courseContent"));
    assert.ok(body.indexOf("if (!res.ok) throw") < body.indexOf("lessonToAdvanceTo("), "advance follows the ok check");
    assert.doesNotMatch(player.slice(0, player.indexOf("async function markComplete")), /lessonToAdvanceTo\(/);
  });

  console.log(`\n${passes} passed, ${failures} failed`);
  process.exit(failures ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
