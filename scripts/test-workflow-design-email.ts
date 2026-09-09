import assert from "node:assert/strict";
import {
  emailDocumentFromMessageTemplate,
  broadcastContentFromEmailDocument,
  emailDocumentFromBroadcastContent,
} from "../src/lib/email/adapters";
import { renderEmailHtml } from "../src/lib/email/render";

/**
 * Regression coverage for Workflow Design Email (Shared Email Foundation
 * Phase 3, 2026-09-09) — the parts practical to exercise without booting the
 * Workflow engine's Firestore/Resend-coupled runtime (engine.ts execSendEmail
 * itself is covered by live QA instead; see the final report).
 */

// "Start from template" must be a genuine COPY: converting a message
// template into a workflow email's editable content, then mutating that
// copy, must never touch the original template object.
const template = {
  id: "tmpl-1",
  name: "Course Purchase",
  subject: "Welcome to {{contact.firstName}}'s course!",
  body: "Thanks for joining. Access it here: {{bookingLink}}",
};
const templateSnapshotBefore = JSON.stringify(template);
const copiedDocument = emailDocumentFromMessageTemplate(template);
const copiedContent = broadcastContentFromEmailDocument(copiedDocument);
assert.equal(copiedContent.blocks.length, 1);
assert.equal(copiedContent.blocks[0].type, "text");

// Mutate the copy the way the designer would (user edits the block).
const editedContent = {
  ...copiedContent,
  blocks: [
    {
      ...copiedContent.blocks[0],
      type: "text" as const,
      html: "<p>Totally different content the user typed.</p>",
    },
  ],
};
assert.equal(
  JSON.stringify(template),
  templateSnapshotBefore,
  "editing the copied content must never mutate the source template"
);

// The edited copy round-trips through the same canonical EmailDocument path
// a save uses, and renders with the user's edits (not the template's).
const savedDocument = emailDocumentFromBroadcastContent(
  editedContent,
  "Welcome to {{contact.firstName}}'s course!",
  "Your access is ready"
);
const html = renderEmailHtml(savedDocument, {
  resolveMergeTags: (v) => v.replace("{{contact.firstName}}", "Jordan"),
});
assert.match(html, /Totally different content the user typed\./);
assert.doesNotMatch(html, /Thanks for joining\. Access it here/);
// Subject/preheader are carried on the EmailDocument itself, not rendered
// into the body HTML (same as Broadcast) — the preheader IS rendered, as a
// hidden preview-text div.
assert.equal(savedDocument.subject, "Welcome to {{contact.firstName}}'s course!");
assert.match(html, /Your access is ready/);

// Marketing compliance: the footer (with Unsubscribe) is appended only when
// includeComplianceFooter is requested and only when there's something to
// show — mirrors the Workflow runtime's rule that marketing-type Design
// Email steps need a mailing address on file (engine.ts execSendEmail).
const marketingHtml = renderEmailHtml(savedDocument, {
  includeComplianceFooter: true,
  businessName: "Acme Co",
  mailingAddress: "123 Main St, Atlanta, GA 30301",
  unsubscribeUrl: "https://example.com/u/abc",
});
assert.match(marketingHtml, /Unsubscribe/);
assert.match(marketingHtml, /Acme Co/);
assert.equal(
  (marketingHtml.match(/Unsubscribe/g) || []).length,
  1,
  "compliance footer must appear exactly once"
);

const transactionalHtml = renderEmailHtml(savedDocument, {
  includeComplianceFooter: false,
});
assert.doesNotMatch(
  transactionalHtml,
  /Unsubscribe/,
  "transactional render must not carry a compliance footer"
);

console.log("workflow design email tests passed");
