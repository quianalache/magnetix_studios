/** Pure Popup rendering-contract QA. Run: pnpm exec tsx scripts/check-popup-rendering.ts */
import assert from "node:assert/strict";
import { clientPuckConfig } from "../src/components/pages-funnels/puck/client-config";
import { createPopupPuckConfig } from "../src/components/pages-funnels/puck/popup-config";
import { sanitizePopupContent, validatePopupContent, POPUP_ALLOWED_BLOCKS } from "../src/lib/pages-funnels/popup-content";
import { createDefaultPopup } from "../src/types/pages-funnels-popup";

const popupConfig = createPopupPuckConfig(clientPuckConfig);
assert.deepEqual(Object.keys(popupConfig.components).sort(), [...POPUP_ALLOWED_BLOCKS].sort(), "restricted config reuses exactly the curated registry");
const unsafe = { root: { props: {} }, content: [
  { type: "Heading", props: { id: "h", text: "Safe" } },
  { type: "CustomHtml", props: { id: "html", html: "<script>throw new Error()</script>" } },
  { type: "Popup", props: { id: "nested" } },
  { type: "Button", props: { id: "button", action: { type: "open_popup", popupId: "other" } } },
] };
const issues = validatePopupContent(unsafe);
assert.equal(issues.length, 3, "unsupported, nested, and reserved actions are reported");
const sanitized = sanitizePopupContent(unsafe);
assert.deepEqual(sanitized.content.map((node) => node.type), ["Heading", "Button"], "unsafe nodes are omitted without crashing");
assert.equal((sanitized.content[1] as { props?: { action?: unknown } }).props?.action, undefined, "reserved popup actions are removed");
const basic = createDefaultPopup("popup_basic", "Basic QA Popup");
assert.equal(validatePopupContent(basic.content).length, 0, "basic Heading/Text fixture is valid");
console.log("Popup rendering QA: 8/8 PASS");
