/**
 * Wave 3 — Conversations design-migration contract (2026-10-15). Static
 * source checks; no browser, no Firebase.
 *
 * Run: node scripts/check-wave3-conversations.mjs
 */
import { readFileSync } from "node:fs";

const C = "src/components/conversations";
const src = (f) => readFileSync(f, "utf8");
let pass = 0;
let fail = 0;
function check(label, ok) {
  if (ok) pass++;
  else {
    fail++;
    console.log(`  FAIL  ${label}`);
  }
}

const files = [
  `${C}/conversation-workspace.tsx`,
  `${C}/conversation-list.tsx`,
  `${C}/conversation-thread.tsx`,
  `${C}/conversation-composer.tsx`,
  `${C}/conversation-contact-panel.tsx`,
  `${C}/conversation-ai-controls.tsx`,
  `${C}/conversation-draft-card.tsx`,
  `${C}/channel-badge.tsx`,
];
for (const f of files) {
  const s = src(f);
  check(`${f}: no native <select>`, !/<select\b/.test(s));
  check(`${f}: no .momentum-scope`, !s.includes("momentum-scope"));
  check(`${f}: no rounded-2xl legacy panels`, !s.includes("rounded-2xl"));
  check(`${f}: no 10–13px arbitrary font sizes`, !/text-\[1[0-3]px\]/.test(s));
  check(`${f}: no legacy lavender/pink/amber fills`, !/\b(bg|text|border)-(violet|pink|amber)-\d{2,3}\b/.test(s));
  check(`${f}: no native confirm()`, !/(^|[^.\w])confirm\(\s*[`"']/m.test(s));
}

const thread = src(`${C}/conversation-thread.tsx`);
check("thread: approved outgoing bubble = plum", /\? "rounded-br-md bg-primary text-primary-foreground"/.test(thread));
check("thread: approved incoming bubble = white with border", /: "rounded-bl-md border border-border bg-card text-foreground"/.test(thread));
check("thread: internal note = gold, labelled not sent", /bg-tint-gold/.test(thread) && /Internal note · not sent/.test(thread));
check("thread: scroll box is positioned (sr-only labels can't stretch the page)", /className="relative min-h-0 flex-1 space-y-4 overflow-y-auto/.test(thread));
check("thread: near-white canvas (no lavender wash)", /overflow-y-auto bg-background/.test(thread));
check("thread: optional native channel styling preserved", /theme === "native"/.test(thread) && /#d9fdd3/.test(thread) && /#0084ff/.test(thread));

const list = src(`${C}/conversation-list.tsx`);
check("list: selected row = subtle violet tint + plum edge", /bg-tint-violet/.test(list) && /before:bg-primary/.test(list));
check("list: unread count = plum", /bg-primary px-1\.5 text-center/.test(list));
check("list: system empty state", /<EmptyState/.test(list));

const ws = src(`${C}/conversation-workspace.tsx`);
check("workspace: system search + segmented All/Unread + channel select", /<SearchField/.test(ws) && /<SegmentedControl/.test(ws) && /noneLabel="All channels"/.test(ws));
check("workspace: assignee uses OptionSelect with Unassigned", /aria-label="Assign conversation"/.test(ws) && /noneLabel="Unassigned"/.test(ws));
check("workspace: context pane is a column only ≥xl (overlay on tablet/phone)", /xl:static xl:w-\[300px\]/.test(ws) && /max-width: 1279px/.test(ws));
check("workspace: no decorative motif", !/<Motif|MomentHero|motif=/.test(ws));

const composer = src(`${C}/conversation-composer.tsx`);
check("composer: Send via = OptionSelect keeping disabled channels + reasons", /<OptionSelect\s+id=\{`\$\{id\}-channel`\}/.test(composer) && /disabled: !!unavailable/.test(composer));
check("composer: Reply / Internal Note segmented control", /<SegmentedControl/.test(composer) && /label: "Internal Note"/.test(composer));
check("composer: note mode is gold", /tab !== "note"\} className="rounded-card border border-gold-300\/60 bg-tint-gold/.test(composer));

const opt = src("src/components/system/option-select.tsx");
check("OptionSelect supports disabled options", /disabled=\{o\.disabled\}/.test(opt));

console.log(`\nWave 3 conversations contract: ${pass} passed, ${fail} failed.`);
process.exit(fail ? 1 : 0);
