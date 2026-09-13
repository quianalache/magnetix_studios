/**
 * Targeted correctness check for video-embed.ts's provider table
 * (parseVideoUrl/embedUrlFor) — YouTube/Vimeo/Loom/Descript (regression),
 * Wistia (new), and Adilo (new, but no real pattern confirmed yet — see
 * that module's own comment).
 *
 * This repo has no test runner configured (no Jest/Vitest, no `test`
 * script) — confirmed by inspection, not assumed. Adding one is a real
 * infrastructure decision outside this task's "small extension" scope, so
 * this is a plain, dependency-free, repeatable verification script
 * instead: same purpose (asserted, rerunnable correctness), same
 * "print exact results, don't just claim" convention already used by every
 * other verification script in this codebase's recent work.
 *
 * Run: pnpm exec tsx scripts/verify-video-providers.ts
 */
import { parseVideoUrl, embedUrlFor } from "../src/lib/community/video-embed";

let pass = 0;
let fail = 0;

function check(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    pass += 1;
  } else {
    fail += 1;
    console.log(`FAIL: ${label}`);
    console.log(`  expected: ${JSON.stringify(expected)}`);
    console.log(`  actual:   ${JSON.stringify(actual)}`);
  }
}

// ---------------------------------------------------------------------------
// Existing providers — must not regress.
// ---------------------------------------------------------------------------
check(
  "YouTube watch URL",
  parseVideoUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ"),
  {
    provider: "youtube",
    id: "dQw4w9WgXcQ",
    embedUrl: "https://www.youtube.com/embed/dQw4w9WgXcQ",
  }
);
check("YouTube short URL", parseVideoUrl("https://youtu.be/dQw4w9WgXcQ"), {
  provider: "youtube",
  id: "dQw4w9WgXcQ",
  embedUrl: "https://www.youtube.com/embed/dQw4w9WgXcQ",
});
check("Vimeo URL", parseVideoUrl("https://vimeo.com/76979871"), {
  provider: "vimeo",
  id: "76979871",
  embedUrl: "https://player.vimeo.com/video/76979871",
});
check(
  "Loom share URL",
  parseVideoUrl("https://www.loom.com/share/abc123DEF456"),
  {
    provider: "loom",
    id: "abc123DEF456",
    embedUrl: "https://www.loom.com/embed/abc123DEF456",
  }
);
check(
  "Descript view URL",
  parseVideoUrl("https://share.descript.com/view/xyz987"),
  {
    provider: "descript",
    id: "xyz987",
    embedUrl: "https://share.descript.com/embed/xyz987",
  }
);
check(
  "embedUrlFor youtube",
  embedUrlFor("youtube", "dQw4w9WgXcQ"),
  "https://www.youtube.com/embed/dQw4w9WgXcQ"
);
check(
  "embedUrlFor vimeo",
  embedUrlFor("vimeo", "76979871"),
  "https://player.vimeo.com/video/76979871"
);
check(
  "embedUrlFor loom",
  embedUrlFor("loom", "abc123"),
  "https://www.loom.com/embed/abc123"
);
check(
  "embedUrlFor descript",
  embedUrlFor("descript", "xyz987"),
  "https://share.descript.com/embed/xyz987"
);

// ---------------------------------------------------------------------------
// Wistia — new.
// ---------------------------------------------------------------------------
check(
  "Wistia canonical iframe embed URL",
  parseVideoUrl("https://fast.wistia.net/embed/iframe/e4a27b971d"),
  {
    provider: "wistia",
    id: "e4a27b971d",
    embedUrl: "https://fast.wistia.net/embed/iframe/e4a27b971d",
  }
);
check(
  "Wistia public medias page URL (default subdomain)",
  parseVideoUrl("https://home.wistia.com/medias/e4a27b971d"),
  {
    provider: "wistia",
    id: "e4a27b971d",
    embedUrl: "https://fast.wistia.net/embed/iframe/e4a27b971d",
  }
);
check(
  "Wistia public medias page URL (custom account subdomain)",
  parseVideoUrl("https://mycompany.wistia.com/medias/AbC12xYz9"),
  {
    provider: "wistia",
    id: "AbC12xYz9",
    embedUrl: "https://fast.wistia.net/embed/iframe/AbC12xYz9",
  }
);
check(
  "embedUrlFor wistia",
  embedUrlFor("wistia", "e4a27b971d"),
  "https://fast.wistia.net/embed/iframe/e4a27b971d"
);

// ---------------------------------------------------------------------------
// Adilo — NOT YET SUPPORTED. Confirms no false positive occurs (a plausible
// Adilo-shaped URL is correctly NOT recognized until a real pattern is
// added), and that embedUrlFor safely returns null rather than guessing.
// ---------------------------------------------------------------------------
check(
  "Adilo URL is not (yet) recognized by any pattern",
  parseVideoUrl("https://adilo.bigcommand.com/watch/abc123"),
  null
);
check(
  "embedUrlFor adilo returns null (no table entry yet)",
  embedUrlFor("adilo", "abc123"),
  null
);

// ---------------------------------------------------------------------------
// Invalid / malformed input — every provider, generic cases.
// ---------------------------------------------------------------------------
check("Empty string", parseVideoUrl(""), null);
check("Whitespace only", parseVideoUrl("   "), null);
check("Unrelated URL", parseVideoUrl("https://example.com/not-a-video"), null);
check(
  "Malformed YouTube id (too short)",
  parseVideoUrl("https://youtu.be/short"),
  null
);
check(
  "Malformed Wistia URL (wrong path)",
  parseVideoUrl("https://fast.wistia.net/embed/channel/e4a27b971d"),
  null
);
check("embedUrlFor with null provider", embedUrlFor(null, "abc"), null);
check("embedUrlFor with null id", embedUrlFor("youtube", null), null);

console.log(`\n${pass} passed, ${fail} failed.`);
process.exit(fail > 0 ? 1 : 0);
