import assert from "node:assert/strict";
import {
  emailDocumentFromBroadcastContent,
  broadcastContentFromEmailDocument,
  emailDocumentFromMessageTemplate,
  emailDocumentFromWorkflowEmail,
} from "../src/lib/email/adapters";
import { renderEmailHtml, renderEmailText } from "../src/lib/email/render";
import { validateEmailDocument } from "../src/lib/email/validate";

const document = {
  version: 1 as const,
  mode: "visual" as const,
  subject: "Welcome {{contact.firstName}}",
  blocks: [
    {
      id: "heading",
      type: "heading" as const,
      text: "Welcome {{contact.firstName}}",
    },
    {
      id: "image",
      type: "image" as const,
      src: "https://cdn.example.com/hero.png",
      alt: "Welcome hero",
    },
    {
      id: "button",
      type: "button" as const,
      label: "Open account",
      href: "https://example.com/account",
    },
    {
      id: "columns",
      type: "columns" as const,
      columns: [
        [{ id: "left", type: "text" as const, html: "<p>One</p>" }],
        [{ id: "right", type: "text" as const, html: "<p>Two</p>" }],
      ],
    },
  ],
};

assert.deepEqual(validateEmailDocument(document), []);
const html = renderEmailHtml(document, {
  resolveMergeTags: (value) => value.replace("{{contact.firstName}}", "Alex"),
});
assert.equal(
  html,
  renderEmailHtml(document, {
    resolveMergeTags: (value) => value.replace("{{contact.firstName}}", "Alex"),
  })
);
assert.match(html, /Alex/);
assert.match(html, /<img/);
assert.match(html, /Open account/);
assert.match(renderEmailText(document), /One\s+Two/);

const unsafe = {
  ...document,
  blocks: [
    {
      id: "bad",
      type: "button" as const,
      label: "Bad",
      href: "javascript:alert(1)",
    },
  ],
};
assert.match(validateEmailDocument(unsafe).join(" "), /unsafe link/);
assert.throws(() => renderEmailHtml(unsafe), /Invalid email document/);

const workflow = emailDocumentFromWorkflowEmail({
  subject: "Hi",
  body: "Plain body",
});
assert.equal(workflow.blocks[0].type, "text");
assert.equal(
  emailDocumentFromMessageTemplate({ subject: "Template", body: "Body" })
    .subject,
  "Template"
);
const broadcast = emailDocumentFromBroadcastContent({
  version: 1,
  blocks: [{ id: "t", type: "text", html: "<p>Hello</p>" }],
});
assert.equal(broadcast.blocks[0].type, "text");
assert.deepEqual(broadcastContentFromEmailDocument(broadcast), {
  version: 1,
  blocks: [{ id: "t", type: "text", html: "<p>Hello</p>" }],
});
const withPreheader = renderEmailHtml({
  ...document,
  preheader: "Preview text",
});
assert.match(withPreheader, /Preview text/);
assert.match(
  renderEmailText(document, {
    includeComplianceFooter: true,
    businessName: "Example",
    mailingAddress: "1 Main St",
    unsubscribeUrl: "https://example.com/unsubscribe",
  }),
  /Unsubscribe:/
);
console.log("shared email foundation tests passed");
