import assert from "node:assert/strict";
import {
  emailDocumentFromBroadcastContent,
  broadcastContentFromEmailDocument,
} from "../src/lib/email/adapters";
import { renderEmailHtml, renderEmailText } from "../src/lib/email/render";

/**
 * Regression coverage for the Broadcast Text block placeholder bug
 * (2026-09-09): a newly-added Text block used to seed
 * `html: "<p>Write something…</p>"` as real stored content instead of a
 * true editor placeholder, so it could leak into the adapter, the
 * renderer, and a sent email.
 *
 * The actual placeholder UI lives in TextBlockEditor (a "use client" TipTap
 * component — see src/components/broadcasts/text-block-editor.tsx), which
 * can't run in this plain-node script; that behavior (typing into a fresh
 * block doesn't append after "Write something…", and it survives a real
 * save/reopen round trip) is verified live in the browser QA pass instead.
 * What IS practical to cover here, framework-free: a Text block seeded the
 * way `newBlock("text")` now seeds it — html: "<p></p>" — must never carry
 * the placeholder phrase through the adapter or the renderer, and a Text
 * block with real authored content must be completely unaffected.
 */

// 1 & 5 & 6 — an empty ("<p></p>") text block adapts and renders cleanly,
// with no trace of the placeholder phrase anywhere.
const emptyBroadcastContent = {
  version: 1 as const,
  blocks: [{ id: "empty", type: "text" as const, html: "<p></p>" }],
};
const emptyDocument = emailDocumentFromBroadcastContent(
  emptyBroadcastContent,
  "Subject"
);
assert.equal(emptyDocument.blocks[0].type, "text");
assert.equal(
  (emptyDocument.blocks[0] as { html: string }).html,
  "<p></p>",
  "empty text block must adapt to EmailDocument with no seeded content"
);
assert.deepEqual(
  broadcastContentFromEmailDocument(emptyDocument),
  emptyBroadcastContent,
  "empty text block must round-trip back to BroadcastContent unchanged"
);
const emptyHtml = renderEmailHtml(
  { version: 1, mode: "visual", subject: "Subject", blocks: emptyDocument.blocks },
  {}
);
assert.doesNotMatch(
  emptyHtml,
  /Write something/,
  "rendered HTML must never contain the placeholder phrase"
);
const emptyText = renderEmailText(
  { version: 1, mode: "visual", subject: "Subject", blocks: emptyDocument.blocks },
  {}
);
assert.doesNotMatch(
  emptyText,
  /Write something/,
  "plain-text alternative must never contain the placeholder phrase"
);

// 7 — an existing block with real authored content is completely
// unaffected by this fix.
const populatedBroadcastContent = {
  version: 1 as const,
  blocks: [
    {
      id: "populated",
      type: "text" as const,
      html: "<p>Hello, this is real authored content.</p>",
    },
  ],
};
const populatedDocument = emailDocumentFromBroadcastContent(
  populatedBroadcastContent,
  "Subject"
);
assert.deepEqual(
  broadcastContentFromEmailDocument(populatedDocument),
  populatedBroadcastContent,
  "populated text block must round-trip unchanged"
);
assert.match(
  renderEmailHtml(
    { version: 1, mode: "visual", subject: "Subject", blocks: populatedDocument.blocks },
    {}
  ),
  /Hello, this is real authored content\./,
  "authored content must still render"
);

// A block whose author genuinely typed the literal phrase is legitimate
// content and must render exactly like any other authored text — this fix
// only changes what a *newly created, untouched* block starts as.
const literalPhraseBroadcastContent = {
  version: 1 as const,
  blocks: [
    { id: "literal", type: "text" as const, html: "<p>Write something…</p>" },
  ],
};
const literalPhraseHtml = renderEmailHtml(
  {
    version: 1,
    mode: "visual",
    subject: "Subject",
    blocks: emailDocumentFromBroadcastContent(literalPhraseBroadcastContent, "Subject")
      .blocks,
  },
  {}
);
assert.match(
  literalPhraseHtml,
  /Write something/,
  "a block the author genuinely typed that phrase into must still render it"
);

console.log("broadcast text block placeholder tests passed");
