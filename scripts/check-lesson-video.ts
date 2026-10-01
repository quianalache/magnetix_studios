/**
 * Lesson video URL helpers — pure checks (no Firebase, no network).
 *
 * Run: pnpm exec tsx scripts/check-lesson-video.ts
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { embedUrlFor } from "../src/lib/community/video-embed";
import { applyLessonVideoAutoplay, bunnyEmbedExpiresAt } from "../src/lib/standalone-courses/lesson-video";

let failures = 0;
function check(name: string, fn: () => void) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failures++;
    console.error(`  ✗ ${name}\n    ${(err as Error).message}`);
  }
}

// Same shape getBunnyPlaybackUrl produces.
const key = "test-token-key";
const guid = "36f99a85-22ce-418c-84a8-5a68c1415bb7";
const expires = 1_900_000_000;
const token = createHash("sha256").update(`${key}${guid}${expires}`).digest("hex");
const bunny = `https://iframe.mediadelivery.net/embed/758965/${guid}?token=${token}&expires=${expires}`;

check("Bunny: autoplay is explicitly OFF by default (Bunny's own default is on)", () => {
  const u = new URL(applyLessonVideoAutoplay(bunny, false));
  assert.equal(u.searchParams.get("autoplay"), "false");
});
check("Bunny: autoplay ON when the course enables it", () => {
  assert.equal(new URL(applyLessonVideoAutoplay(bunny, true)).searchParams.get("autoplay"), "true");
});
check("Bunny: signed token + expiry are untouched (signature still verifies)", () => {
  const u = new URL(applyLessonVideoAutoplay(bunny, false));
  assert.equal(u.pathname, `/embed/758965/${guid}`);
  assert.equal(u.searchParams.get("token"), token);
  assert.equal(u.searchParams.get("expires"), String(expires));
  const recomputed = createHash("sha256").update(`${key}${guid}${u.searchParams.get("expires")}`).digest("hex");
  assert.equal(recomputed, u.searchParams.get("token"));
});
check("Bunny: idempotent — re-applying doesn't duplicate the param", () => {
  const twice = applyLessonVideoAutoplay(applyLessonVideoAutoplay(bunny, true), false);
  assert.deepEqual(new URL(twice).searchParams.getAll("autoplay"), ["false"]);
});

const yt = embedUrlFor("youtube", "dQw4w9WgXcQ")!;
const vimeo = embedUrlFor("vimeo", "76979871")!;
const wistia = embedUrlFor("wistia", "abc123xyz")!;
const loom = embedUrlFor("loom", "0123456789abcdef0123456789abcdef")!;
const adilo = embedUrlFor("adilo", "Ok2zBWdW")!;

check("External: default (off) leaves every provider URL byte-identical", () => {
  for (const url of [yt, vimeo, wistia, loom, adilo]) assert.equal(applyLessonVideoAutoplay(url, false), url);
});
check("External: autoplay ON uses each provider's documented param", () => {
  assert.equal(new URL(applyLessonVideoAutoplay(yt, true)).searchParams.get("autoplay"), "1");
  assert.equal(new URL(applyLessonVideoAutoplay(vimeo, true)).searchParams.get("autoplay"), "1");
  assert.equal(new URL(applyLessonVideoAutoplay(loom, true)).searchParams.get("autoplay"), "1");
  assert.equal(new URL(applyLessonVideoAutoplay(wistia, true)).searchParams.get("autoPlay"), "true");
});
check("External: providers without a known autoplay param are left unchanged", () => {
  assert.equal(applyLessonVideoAutoplay(adilo, true), adilo);
});
check("Lookalike hosts are never treated as Bunny", () => {
  const fake = "https://iframe.mediadelivery.net.evil.example/embed/1/2?token=x&expires=1";
  assert.equal(applyLessonVideoAutoplay(fake, false), fake);
  assert.equal(bunnyEmbedExpiresAt(fake), null);
});

check("Expiry: parsed from a signed Bunny URL (with or without the autoplay param)", () => {
  assert.equal(bunnyEmbedExpiresAt(bunny), expires);
  assert.equal(bunnyEmbedExpiresAt(applyLessonVideoAutoplay(bunny, false)), expires);
});
check("Expiry: external providers carry no token", () => {
  assert.equal(bunnyEmbedExpiresAt(yt), null);
  assert.equal(bunnyEmbedExpiresAt("not a url"), null);
});

if (failures) {
  console.error(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log("\nAll lesson video checks passed");
