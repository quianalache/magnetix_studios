/**
 * Focused, dependency-free assertion script for the Skool @mention fix
 * (skoolContentToHtml / convertSkoolMentions, mapping.ts). Run with:
 *   npx tsx scripts/skool-mention-fix-tests.ts
 *
 * No test framework exists anywhere in this codebase (confirmed: no
 * vitest/jest config, no *.test.ts file anywhere) — this follows the same
 * plain-tsx-script convention every other verification in this codebase
 * already uses, rather than introducing new tooling for one small fix.
 * Exits non-zero (and prints every failure) if any assertion fails.
 */
import { skoolContentToHtml, type SkoolMentionResolver } from "../src/lib/server/skool-import/mapping";

let failures = 0;
function assertEqual(name: string, actual: string, expected: string) {
  if (actual !== expected) {
    failures += 1;
    console.error(`FAIL: ${name}\n  expected: ${expected}\n  actual:   ${actual}`);
  } else {
    console.log(`PASS: ${name}`);
  }
}

const activeMember: SkoolMentionResolver = new Map([
  ["828c375e4cd34f61886445322fbf3dff", { memberId: "2dwubQ8k3D3qqMhdjhwJ", displayName: "Quiana LaChé" }],
]);

const historicalAuthor: SkoolMentionResolver = new Map([
  ["9ac87b0650c34370922a907d25eb4026", { memberId: "94EEDIq0IDsYxMtrd4FI", displayName: "Shanlee Apeiron" }],
]);

const both: SkoolMentionResolver = new Map([...activeMember, ...historicalAuthor]);

// 1. One mention, active member.
assertEqual(
  "one mention (active member)",
  skoolContentToHtml("Thanks [@Quiana LaChé](obj://user/828c375e4cd34f61886445322fbf3dff)!", activeMember),
  '<p>Thanks <span data-type="mention" data-id="2dwubQ8k3D3qqMhdjhwJ" data-label="Quiana LaChé">@Quiana LaChé</span>!</p>',
);

// 2. Historical-author mention.
assertEqual(
  "historical-author mention",
  skoolContentToHtml("cc [@Shanlee Apeiron](obj://user/9ac87b0650c34370922a907d25eb4026)", historicalAuthor),
  '<p>cc <span data-type="mention" data-id="94EEDIq0IDsYxMtrd4FI" data-label="Shanlee Apeiron">@Shanlee Apeiron</span></p>',
);

// 3. Several mentions in one body.
assertEqual(
  "several mentions",
  skoolContentToHtml(
    "[@Quiana LaChé](obj://user/828c375e4cd34f61886445322fbf3dff) and [@Shanlee Apeiron](obj://user/9ac87b0650c34370922a907d25eb4026) both replied",
    both,
  ),
  '<p><span data-type="mention" data-id="2dwubQ8k3D3qqMhdjhwJ" data-label="Quiana LaChé">@Quiana LaChé</span> and <span data-type="mention" data-id="94EEDIq0IDsYxMtrd4FI" data-label="Shanlee Apeiron">@Shanlee Apeiron</span> both replied</p>',
);

// 4. Mention mixed with ordinary text (before and after).
assertEqual(
  "mention mixed with ordinary text",
  skoolContentToHtml("Hey team, [@Quiana LaChé](obj://user/828c375e4cd34f61886445322fbf3dff) can you check this?", activeMember),
  '<p>Hey team, <span data-type="mention" data-id="2dwubQ8k3D3qqMhdjhwJ" data-label="Quiana LaChé">@Quiana LaChé</span> can you check this?</p>',
);

// 5. Mention mixed with a real http(s) link -- must not interfere with each other.
assertEqual(
  "mention mixed with http(s) link",
  skoolContentToHtml(
    "See [this video](https://example.com/video) and ask [@Quiana LaChé](obj://user/828c375e4cd34f61886445322fbf3dff)",
    activeMember,
  ),
  '<p>See <a href="https://example.com/video">this video</a> and ask <span data-type="mention" data-id="2dwubQ8k3D3qqMhdjhwJ" data-label="Quiana LaChé">@Quiana LaChé</span></p>',
);

// 6. Unresolved mention (no resolver entry for this Skool user id) -- must
//    degrade to clean plain text, never leave the raw markup.
assertEqual(
  "unresolved mention degrades to plain text",
  skoolContentToHtml("cc [@Nobody Here](obj://user/ffffffffffffffffffffffffffffffff)", activeMember),
  "<p>cc @Nobody Here</p>",
);

// 7. No resolver passed at all -- every mention degrades (pre-existing
//    callers that don't pass one keep working, never crash).
assertEqual(
  "no resolver passed",
  skoolContentToHtml("cc [@Quiana LaChé](obj://user/828c375e4cd34f61886445322fbf3dff)"),
  "<p>cc @Quiana LaChé</p>",
);

// 8. Malformed obj:// markup (not the well-formed user/<id> shape) -- must
//    still neutralize to plain text, never left as broken raw markdown.
assertEqual(
  "malformed obj:// path",
  skoolContentToHtml("cc [@Weird](obj://something/else)", activeMember),
  "<p>cc @Weird</p>",
);
assertEqual(
  "malformed obj:// empty path",
  skoolContentToHtml("cc [@Empty](obj://)", activeMember),
  "<p>cc @Empty</p>",
);

// 9. Regression: ordinary text untouched.
assertEqual("ordinary text", skoolContentToHtml("just a normal sentence."), "<p>just a normal sentence.</p>");

// 10. Regression: ordinary markdown link (http) still converts.
assertEqual(
  "ordinary http(s) link",
  skoolContentToHtml("check [my site](https://example.com)"),
  '<p>check <a href="https://example.com">my site</a></p>',
);

// 11. Regression: bold/italic still work, including alongside a mention.
assertEqual(
  "bold + italic + mention together",
  skoolContentToHtml(
    "**bold** and *italic* and [@Quiana LaChé](obj://user/828c375e4cd34f61886445322fbf3dff)",
    activeMember,
  ),
  '<p><strong>bold</strong> and <em>italic</em> and <span data-type="mention" data-id="2dwubQ8k3D3qqMhdjhwJ" data-label="Quiana LaChé">@Quiana LaChé</span></p>',
);

// 12. Regression: emoji pass through untouched, including alongside a mention.
assertEqual(
  "emoji alongside a mention",
  skoolContentToHtml("🎉 congrats [@Quiana LaChé](obj://user/828c375e4cd34f61886445322fbf3dff) 🎉", activeMember),
  '<p>🎉 congrats <span data-type="mention" data-id="2dwubQ8k3D3qqMhdjhwJ" data-label="Quiana LaChé">@Quiana LaChé</span> 🎉</p>',
);

// 13. Regression: line breaks (single \n -> <br>) still work around a mention.
assertEqual(
  "line break around a mention",
  skoolContentToHtml("line one\n[@Quiana LaChé](obj://user/828c375e4cd34f61886445322fbf3dff)", activeMember),
  '<p>line one<br><span data-type="mention" data-id="2dwubQ8k3D3qqMhdjhwJ" data-label="Quiana LaChé">@Quiana LaChé</span></p>',
);

// 14. Regression: blank-line paragraph splitting still works with a mention
//     in one of the paragraphs.
assertEqual(
  "paragraph splitting with a mention in one paragraph",
  skoolContentToHtml("first paragraph\n\n[@Quiana LaChé](obj://user/828c375e4cd34f61886445322fbf3dff) second paragraph", activeMember),
  '<p>first paragraph</p><p><span data-type="mention" data-id="2dwubQ8k3D3qqMhdjhwJ" data-label="Quiana LaChé">@Quiana LaChé</span> second paragraph</p>',
);

// 15. HTML-special characters in the resolved display name are escaped in
//     both the visible text and the data-label attribute.
assertEqual(
  "display name with HTML-special characters is escaped",
  skoolContentToHtml(
    "cc [@Old Label](obj://user/danger)",
    new Map([["danger", { memberId: "m1", displayName: 'A & B "C"' }]]),
  ),
  '<p>cc <span data-type="mention" data-id="m1" data-label="A &amp; B &quot;C&quot;">@A &amp; B "C"</span></p>',
);

console.log(`\n${failures === 0 ? "ALL PASSED" : `${failures} FAILURE(S)`}`);
process.exit(failures === 0 ? 0 : 1);
