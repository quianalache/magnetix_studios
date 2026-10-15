/**
 * Wave 2 design-migration page contract (2026-10-14) — Contacts, Calendar,
 * Tasks (My Tasks under Projects), Projects. Static source checks; no
 * browser, no Firebase. Keeps the migrated surfaces on the system composites
 * and guards the root-cause fixes (contained table scroll boxes).
 *
 * Run: node scripts/check-wave2-pages.mjs
 */
import { readFileSync } from "node:fs";

const SA = "src/app/(dashboard)/sa/[subAccountId]";
const src = (f) => readFileSync(f, "utf8");

/** Route pages that must render inside the system PageShell. */
const SHELL_PAGES = [
  `${SA}/contacts/page.tsx`,
  `${SA}/contacts/[id]/page.tsx`,
  `${SA}/calendar/page.tsx`,
  `${SA}/projects/[projectId]/page.tsx`,
  `${SA}/projects/routines/[routineId]/page.tsx`,
  "src/components/projects/projects-shell.tsx", // Overview · My Tasks · Routines · Templates · Archived
];

/** Migrated files that must not re-introduce legacy patterns. */
const CLEAN = [
  ...SHELL_PAGES,
  `${SA}/projects/page.tsx`,
  `${SA}/projects/tasks/page.tsx`,
  `${SA}/projects/routines/page.tsx`,
  `${SA}/projects/archived/page.tsx`,
  "src/components/contacts/contacts-table.tsx",
  "src/components/contacts/contacts-filter-bar.tsx",
  "src/components/contacts/contact-columns.tsx",
  "src/components/contacts/contact-profile-view.tsx",
  "src/components/contacts/contact-profile-header.tsx",
  "src/components/contacts/contact-info-card.tsx",
  "src/components/contacts/related-card.tsx",
  "src/components/contacts/source-badge.tsx",
  "src/components/contacts/contact-form.tsx",
  "src/components/contacts/contact-projects.tsx",
  "src/components/calendar/calendar-view.tsx",
  "src/components/calendar/event-dialog.tsx",
  "src/components/calendar/booking-reassign.tsx",
  "src/components/projects/projects-list.tsx",
  "src/components/projects/project-task-views.tsx",
  "src/components/projects/template-badges.tsx",
  "src/components/tasks/task-dialog.tsx",
  "src/components/tasks/task-meta.tsx",
];

let pass = 0;
let fail = 0;
function check(label, ok) {
  if (ok) pass++;
  else {
    fail++;
    console.log(`  FAIL  ${label}`);
  }
}

for (const f of SHELL_PAGES) check(`${f}: renders inside PageShell`, /components\/system\/page-shell/.test(src(f)));

for (const f of CLEAN) {
  const s = src(f);
  check(`${f}: no .momentum-scope`, !s.includes("momentum-scope"));
  check(`${f}: no native confirm()`, !/(^|[^.\w])confirm\(\s*[`"']/m.test(s) && !s.includes("window.confirm"));
  check(`${f}: no native <select>`, !/<select\b/.test(s));
  check(`${f}: no rounded-2xl/[20px] legacy cards`, !/rounded-2xl|rounded-\[20px\]/.test(s));
  check(`${f}: no 10–12px arbitrary font sizes`, !/text-\[1[0-2]px\]/.test(s));
  check(`${f}: no raw hex colors`, !/#[0-9a-fA-F]{6}\b/.test(s));
  check(`${f}: no legacy pastel gradients`, !/bg-gradient-to-\w+ from-(pink|violet|indigo)/.test(s));
}

// Root cause of the Contacts / Projects / My Tasks sideways scroll: an
// absolutely-positioned sr-only header label escaping a table scroll box with
// no positioned ancestor. Every table scroll box must now contain it.
for (const f of [
  "src/components/contacts/contacts-table.tsx",
  "src/components/projects/projects-list.tsx",
  "src/components/projects/project-task-views.tsx",
  `${SA}/projects/tasks/page.tsx`,
  "src/components/routines/routine-detail-sheet.tsx",
]) {
  const s = src(f);
  const bare = (s.match(/className="overflow-x-auto[ "]/g) || []).length;
  check(`${f}: every table scroll box is positioned (DataTableShell or relative)`, bare === 0);
}
check("DataTableShell scroll body is a containing block", /relative overflow-x-auto/.test(src("src/components/system/data-table.tsx")));

// Contacts: plum header + pagination inside the table card + system Pagination.
const contactsTable = src("src/components/contacts/contacts-table.tsx");
check("contacts: table uses DataTableShell + plum header row", /<DataTableShell/.test(contactsTable) && /DATA_TABLE_HEAD_ROW/.test(contactsTable));
check("contacts: pagination rendered inside the table card", /footer=\{footer\}/.test(contactsTable));
check("contacts: list page uses the system Pagination", /components\/system\/pagination/.test(src(`${SA}/contacts/page.tsx`)));
check("contacts: phones keep the card list (no squeezed table)", /md:hidden/.test(contactsTable) && /hidden md:block/.test(contactsTable));

// Calendar: specialised surface, quiet (no motif), reduced phone layout.
const cal = src("src/components/calendar/calendar-view.tsx");
const calPage = src(`${SA}/calendar/page.tsx`);
check("calendar: no motif accent", !/accent=/.test(calPage));
check("calendar: phone month grid is a dot date-picker", /sm:hidden" aria-label=\{`\$\{dayItems\.length\} items`\}/.test(cal));
check("calendar: week view stacks on phones", /grid-cols-1 sm:grid-cols-7/.test(cal));
check("calendar: system view switch + search", /<SegmentedControl/.test(cal) && /<SearchField/.test(cal));

// Tasks: one engine, one status vocabulary.
check("tasks: /tasks still redirects to Projects → My Tasks", /redirect\(`\/sa\/\$\{subAccountId\}\/projects\/tasks`\)/.test(src(`${SA}/tasks/page.tsx`)));
check("tasks: status pills use system tones", /STATUS_TONE_FOR/.test(src("src/components/tasks/task-meta.tsx")));

// Projects: orbit only on the Overview (genuine progress), never the planet.
const shell = src("src/components/projects/projects-shell.tsx");
check("projects: orbit accent only on Overview", /accent=\{active === "overview" \? "orbit" : undefined\}/.test(shell));
check("projects: Dashboard planet never reused", CLEAN.every((f) => !/kind="planet"|motif="planet"/.test(src(f))));

// Shared OptionSelect keeps "none" as null (never an empty-string value).
const opt = src("src/components/system/option-select.tsx");
check("OptionSelect maps the none choice to null", /onChange\(next === NONE \? null/.test(opt));

// Wave 2 follow-up (2026-10-15): legacy reading repair, New Reading dialog, Decoder card, calendar rail.
const repair = src("src/lib/server/reading-contact-repair-service.ts");
check("repair: refuses to change a healthy link (409)", /status: 409/.test(repair) && /already linked to an existing contact/.test(repair));
check("repair: new contact must be in the same sub-account", /nextContact\.get\("subAccountId"\) !== subAccountId/.test(repair));
check("repair: writes only contactId (reading + matching profile)", (repair.match(/tx\.update\(/g) || []).length === 2 && !/tx\.set\(/.test(repair));
check("repair: POST is admin-only", /requireSubAccountAdmin/.test(src("src/app/api/sub-accounts/[id]/energetic-decoder/_routes/readings/[readingId]/contact/route.ts")));
const nrd = src("src/components/energetic-decoder/new-reading-dialog.tsx");
check("New Reading: keeps both options (new person + existing contact)", /New person \(new contact\)/.test(nrd) && /<DecoderContactPicker/.test(nrd));
check("New Reading: dialog children can't widen the dialog", /\[&>\*\]:min-w-0/.test(nrd));
check("New Reading: no window.confirm", !nrd.includes("window.confirm"));
const picker = src("src/components/energetic-decoder/contact-picker.tsx");
check("contact picker: contained scroll + truncating rows + SearchField", /overflow-y-auto/.test(picker) && /truncate/.test(picker) && /<SearchField/.test(picker));
const card = src("src/components/contacts/contact-energetic-decoding.tsx");
check("Decoder card: hidden when there is no data", /people\.length === 0\) return null/.test(card));
check("Decoder card: only real facts (filters empty values)", /\.filter\(\(f\): f is \[string, string\] => !!f\[1\]\)/.test(card));
check("calendar rail: aqua / blush / lavender accents", /bg-tag-aqua-fg\/60/.test(cal) && /bg-tag-pink-fg\/50/.test(cal) && /bg-tag-violet-fg\/45/.test(cal));

// Wave 2 closure (2026-10-15): no dead rail affordances; warm Decoder card.
check("calendar: Upcoming Deadlines → View all links to My Tasks (Upcoming)", /saPath\("\/projects\/tasks\?filter=upcoming"\)/.test(cal));
check("calendar: no inert 'View all' / 'Edit' text spans in the rail", !/<span className="shrink-0 text-caption font-medium text-link">(View all|Edit)<\/span>/.test(cal));
const tasksPage = src(`${SA}/projects/tasks/page.tsx`);
check("my tasks: ?filter= only selects an EXISTING status filter", /requested in FILTER_LABELS/.test(tasksPage));
check("Decoder card: warm gold tint (the profile's one tinted card)", /bg-tint-gold/.test(card) && /bg-tag-gold-bg/.test(card));

console.log(`\nWave 2 page contract: ${pass} passed, ${fail} failed.`);
process.exit(fail ? 1 : 0);
