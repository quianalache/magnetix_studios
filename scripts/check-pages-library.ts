/**
 * Pages & Funnels home (2026-11) — PURE checks (no Firestore, no network):
 * automatic-thumbnail rules (which version, staleness, throttles), the
 * library's search / filter / sort / paging, and the capture pass token.
 *
 * Run: NODE_OPTIONS="--require ./scripts/_server-only-shim.cjs" AUTOMATIONS_TOKEN_SECRET=test-secret-0123456789 pnpm exec tsx scripts/check-pages-library.ts
 */
import assert from "node:assert/strict";
import { DRAFT_MIN_INTERVAL_MS, RETRY_AFTER_MS, thumbnailIsCurrent, thumbnailTarget, thumbnailToQueue, toMillis } from "../src/lib/pages-funnels/thumbnail";
import { clampPage, DEFAULT_PAGE_FILTERS, describeUse, filterFunnels, filterPages, type PageFunnelUse, type PagesLibraryFunnel } from "../src/lib/pages-funnels/library";
import { issueThumbnailToken, verifyThumbnailToken } from "../src/lib/server/pages-funnels/thumbnail-token";
import type { PageDoc } from "../src/types/pages-funnels";

let passes = 0;
let failures = 0;
function check(label: string, fn: () => void) {
  try {
    fn();
    passes++;
    console.log(`  ok  ${label}`);
  } catch (err) {
    failures++;
    console.log(`  FAIL ${label}\n       ${(err as Error).message}`);
  }
}

const T = (ms: number) => ({ toMillis: () => ms }) as unknown as PageDoc["puckPublishedAt"];
const data = { content: [], root: { props: {} } } as unknown as PageDoc["puckDraftData"];
type P = Parameters<typeof thumbnailTarget>[0];
const base: P = { pageType: "sales", status: "draft", puckDraftData: null, puckPublishedData: null, puckDraftUpdatedAt: null, puckPublishedAt: null, thumbnail: null, thumbnailRequest: null };
const NOW = 1_800_000_000_000;

console.log("\nThumbnail target");
check("never-saved page has no target", () => assert.equal(thumbnailTarget(base), null));
check("draft page targets its draft", () => assert.deepEqual(thumbnailTarget({ ...base, puckDraftData: data, puckDraftUpdatedAt: T(100) }), { variant: "draft", sourceVersion: 100 }));
check("published page targets the published version (not a newer draft)", () =>
  assert.deepEqual(thumbnailTarget({ ...base, status: "published", puckDraftData: data, puckPublishedData: data, puckDraftUpdatedAt: T(900), puckPublishedAt: T(500) }), { variant: "published", sourceVersion: 500 }));
check("unpublished page (status draft, old snapshot) falls back to its draft", () =>
  assert.equal(thumbnailTarget({ ...base, status: "draft", puckDraftData: data, puckPublishedData: data, puckDraftUpdatedAt: T(900), puckPublishedAt: T(500) })?.variant, "draft"));
check("Reading Result pages never get one", () => assert.equal(thumbnailTarget({ ...base, pageType: "reading_result", puckDraftData: data, puckDraftUpdatedAt: T(1) }), null));
check("pending server timestamp (no toMillis) waits", () => assert.equal(thumbnailTarget({ ...base, puckDraftData: data, puckDraftUpdatedAt: {} as never }), null));
check("toMillis reads serialized timestamps and numbers", () => {
  assert.equal(toMillis({ seconds: 2 }), 2000);
  assert.equal(toMillis({ _seconds: 3 }), 3000);
  assert.equal(toMillis(5), 5);
  assert.equal(toMillis(null), null);
});

console.log("\nStaleness + throttles");
const pub: P = { ...base, status: "published", puckDraftData: data, puckPublishedData: data, puckDraftUpdatedAt: T(500), puckPublishedAt: T(500) };
const thumb = (variant: "draft" | "published", v: number, capturedAt = NOW - 10 * 3600_000) => ({ url: "u", storageKey: "k", variant, sourceVersion: v, capturedAt, width: 640, height: 400 });
check("current thumbnail isn't re-queued", () => assert.equal(thumbnailToQueue({ ...pub, thumbnail: thumb("published", 500) }, NOW), null));
check("republish makes it stale", () => assert.deepEqual(thumbnailToQueue({ ...pub, puckPublishedAt: T(600), thumbnail: thumb("published", 500) }, NOW), { variant: "published", sourceVersion: 600 }));
check("draft thumbnail on a now-published page is replaced", () => assert.equal(thumbnailToQueue({ ...pub, thumbnail: thumb("draft", 900) }, NOW)?.variant, "published"));
check("thumbnailIsCurrent compares variant and version", () => {
  assert.equal(thumbnailIsCurrent({ ...pub, thumbnail: thumb("published", 400) }, { variant: "published", sourceVersion: 500 }), false);
  assert.equal(thumbnailIsCurrent({ ...pub, thumbnail: thumb("published", 500) }, { variant: "published", sourceVersion: 500 }), true);
});
check("a pending request for the same version isn't repeated within 15 min", () => {
  const p = { ...pub, thumbnailRequest: { at: NOW - 60_000, variant: "published" as const, sourceVersion: 500 } };
  assert.equal(thumbnailToQueue(p, NOW), null);
  assert.ok(thumbnailToQueue(p, NOW + RETRY_AFTER_MS));
});
check("drafts are captured at most hourly", () => {
  const d: P = { ...base, puckDraftData: data, puckDraftUpdatedAt: T(NOW - 1000), thumbnail: thumb("draft", NOW - 5000, NOW - 10 * 60_000) };
  assert.equal(thumbnailToQueue(d, NOW), null);
  assert.ok(thumbnailToQueue(d, NOW - 10 * 60_000 + DRAFT_MIN_INTERVAL_MS + 1));
});

console.log("\nLibrary filters");
const page = (id: string, name: string, pageType: PageDoc["pageType"], status: PageDoc["status"], ms: number) =>
  ({ id, name, pageType, status, updatedAt: T(ms), createdAt: T(ms) }) as Pick<PageDoc, "id" | "name" | "pageType" | "status" | "updatedAt" | "createdAt">;
const pages = [page("a", "Course Sales Page", "sales", "published", 300), page("b", "Thank You", "thank_you", "published", 200), page("c", "Café Waitlist", "waitlist", "draft", 100)];
const funnelUse = (funnelId: string, funnelName: string): PageFunnelUse => ({ funnelId, funnelName, funnelStatus: "published", stepId: "s", stepName: "x", stepType: "thank_you", stepNumber: 4 });
const usage = { b: [funnelUse("f1", "Spring Launch"), funnelUse("f2", "Webinar")] };
const run = (f: Partial<typeof DEFAULT_PAGE_FILTERS>) => filterPages(pages, { ...DEFAULT_PAGE_FILTERS, ...f }, usage).map((p) => p.id);
check("default: newest first", () => assert.deepEqual(run({}), ["a", "b", "c"]));
check("name sort", () => assert.deepEqual(run({ sort: "name" }), ["c", "a", "b"]));
check("search ignores case and accents", () => assert.deepEqual(run({ query: "CAFE" }), ["c"]));
check("search matches funnel names", () => assert.deepEqual(run({ query: "spring" }), ["b"]));
check("type + status filters", () => {
  assert.deepEqual(run({ type: "sales" }), ["a"]);
  assert.deepEqual(run({ status: "draft" }), ["c"]);
});
check("funnel filters: standalone vs one funnel", () => {
  assert.deepEqual(run({ funnel: "standalone" }), ["a", "c"]);
  assert.deepEqual(run({ funnel: "funnel:f2" }), ["b"]);
});
check("use label", () => assert.equal(describeUse(funnelUse("f1", "Spring Launch")), "Spring Launch · Step 4 Thank you"));
check("funnel list filters", () => {
  const fs: PagesLibraryFunnel[] = [
    { id: "1", name: "Spring Launch", status: "published", stepCount: 3, createdAt: 0, updatedAt: 0 },
    { id: "2", name: "Webinar", status: "draft", stepCount: 1, createdAt: 0, updatedAt: 0 },
  ];
  assert.deepEqual(filterFunnels(fs, "web", null).map((f) => f.id), ["2"]);
  assert.deepEqual(filterFunnels(fs, "", "published").map((f) => f.id), ["1"]);
});
check("paging clamps", () => {
  assert.equal(clampPage(5, 13, 12), 2);
  assert.equal(clampPage(0, 0, 12), 1);
});

console.log("\nCapture pass");
check("token verifies only for its page and variant", () => {
  const t = issueThumbnailToken("page1", "draft", NOW)!;
  assert.equal(verifyThumbnailToken(t, "page1", NOW + 1000), "draft");
  assert.equal(verifyThumbnailToken(t, "page2", NOW + 1000), null);
});
check("token expires after 3 minutes", () => {
  const t = issueThumbnailToken("page1", "published", NOW)!;
  assert.equal(verifyThumbnailToken(t, "page1", NOW + 3 * 60_000 + 1), null);
});
check("tampered variant or signature is refused", () => {
  const t = issueThumbnailToken("page1", "published", NOW)!;
  assert.equal(verifyThumbnailToken(t.replace(".published.", ".draft."), "page1", NOW), null);
  assert.equal(verifyThumbnailToken(t.slice(0, -2) + "xx", "page1", NOW), null);
  assert.equal(verifyThumbnailToken(undefined, "page1", NOW), null);
  assert.equal(verifyThumbnailToken(["a"], "page1", NOW), null);
});

console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
