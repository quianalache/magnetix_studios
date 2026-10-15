/**
 * Wave 4 — Pipeline design-migration contract (2026-10-15). Static source
 * checks; no browser, no Firebase.
 *
 * Run: node scripts/check-wave4-pipeline.mjs
 */
import { readFileSync } from "node:fs";

const P = "src/components/pipeline";
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
  `${P}/pipelines-overview.tsx`,
  `${P}/pipeline-workspace.tsx`,
  `${P}/pipeline-board.tsx`,
  `${P}/deal-card.tsx`,
  `${P}/deal-filter-bar.tsx`,
  `${P}/deal-list-view.tsx`,
  `${P}/deal-details-panel.tsx`,
  `${P}/new-deal-dialog.tsx`,
  `${P}/edit-deal-dialog.tsx`,
  `${P}/manage-stages-dialog.tsx`,
  `${P}/move-stage-sheet.tsx`,
  `${P}/lost-reason-dialog.tsx`,
  `${P}/customize-cards-dialog.tsx`,
  `${P}/pipeline-form-dialog.tsx`,
  "src/app/(dashboard)/sa/[subAccountId]/pipeline/page.tsx",
  "src/app/(dashboard)/sa/[subAccountId]/pipeline/[pipelineId]/page.tsx",
];
for (const f of files) {
  const s = src(f);
  check(`${f}: no native <select>`, !/<select\b/.test(s));
  check(`${f}: no .momentum-scope`, !s.includes("momentum-scope"));
  check(`${f}: no rounded-2xl legacy panels`, !s.includes("rounded-2xl"));
  check(`${f}: no 9–13px arbitrary font sizes`, !/text-\[(9|1[0-3])px\]/.test(s));
  check(`${f}: no raw Tailwind palette colors`, !/\b(bg|text|border|ring)-(violet|pink|amber|emerald|rose|slate|indigo|sky|teal|orange|fuchsia|cyan|purple)-\d{2,3}\b/.test(s));
  check(`${f}: no hard-coded hex surfaces`, !/(bg|border)-\[#[0-9a-fA-F]{6}\]/.test(s));
  check(`${f}: no native confirm()`, !/window\.confirm\(/.test(s));
}

const color = src("src/lib/pipelines/stage-color.ts");
check("stage color: shared chart palette (Dashboard mapping)", /new: 8/.test(color) && /won: 6/.test(color) && /var\(--ds-chart-/.test(color));
const dash = src("src/app/(dashboard)/sa/[subAccountId]/dashboard/page.tsx");
check("Dashboard uses the shared stage color (no private copy)", /from "@\/lib\/pipelines\/stage-color"/.test(dash) && !/const STAGE_CHART_VAR/.test(dash));

const overview = src(`${P}/pipelines-overview.tsx`);
check("overview: PageShell + PageHeader + FilterBar/SearchField/OptionSelect", /<PageShell width="data">/.test(overview) && /<PageHeader/.test(overview) && /<SearchField/.test(overview) && /<OptionSelect/.test(overview));
check("overview: archive uses the shared confirm dialog", /useConfirm\(\)/.test(overview) && /confirmLabel: "Archive"/.test(overview));
check("overview: stage bar uses stage colors", /stageColor\(s\.id, i\)/.test(overview));
check("overview: status via StatusPill", /<StatusPill/.test(overview));

const ws = src(`${P}/pipeline-workspace.tsx`);
check("workspace: full-width PageShell + operational PageHeader (no motif)", /<PageShell width="full"/.test(ws) && /<PageHeader/.test(ws) && !/accent=|motif=/.test(ws));
check("workspace: pipeline switcher is the title", /aria-label="Switch pipeline"/.test(ws) && /title=\{switcher\}/.test(ws));
check("workspace: Board/List = SegmentedControl", /<SegmentedControl[\s\S]*value: "board"/.test(ws));
check("workspace: phone ⋯ keeps Manage Stages + Customize Cards", /aria-label="Pipeline options"/.test(ws) && /sm:hidden/.test(ws));
check("workspace: archived notice is an Alert", /<Alert tone="warning">/.test(ws));
check("workspace: move semantics unchanged (optimistic + patchDealApi + lostReason)", /patchDealApi\(deal\.id, lostReason !== undefined \? \{ stageId, lostReason \} : \{ stageId \}\)/.test(ws));

const board = src(`${P}/pipeline-board.tsx`);
check("board: dnd-kit drag + PointerSensor distance 4 preserved", /useSensor\(PointerSensor, \{ activationConstraint: \{ distance: 4 \} \}\)/.test(board) && /<DragOverlay/.test(board));
check("board: lost goes through the lost-reason dialog", /if \(stageId === "lost"\) \{\s*setPendingLost\(deal\)/.test(board));
check("board: stage accent line from stageColor", /stageColor\(stage\.id, index\)/.test(board) && /borderTopColor: accent/.test(board));
check("board: Royal Violet drop target", /isOver && "border-violet-ds-300 bg-tint-violet/.test(board));
check("board: quiet near-white column surface", /rounded-card border border-border bg-surface-sunken/.test(board));
check("board: columns scroll internally on md+ (stage headers stay visible)", /md:max-h-\[calc\(100dvh-21rem\)\][^"]*md:overflow-y-auto/.test(board));
check("board: phone Move-stage sheet preserved", /<MoveStageSheet/.test(board));

const card = src(`${P}/deal-card.tsx`);
check("card: compact white card, violet hover, plum-free", /rounded-control border border-border bg-card px-3 py-2\.5/.test(card));
check("card: priority = quiet system Tag", /<DealPriorityTag/.test(card));
check("card: drag source = dashed faded placeholder", /dragging && "border-dashed border-violet-ds-300 opacity-40/.test(card));
check("card: Won completed tick uses status-success tokens", /bg-status-success-bg text-status-success-fg/.test(card));
check("card: phone Move stage button kept (md:hidden)", /Move stage/.test(card) && /md:hidden/.test(card));

const list = src(`${P}/deal-list-view.tsx`);
check("list: approved table frame + plum heading band + Pagination", /<DataTableShell/.test(list) && /DATA_TABLE_HEAD_ROW/.test(list) && /<Pagination/.test(list));
check("list: phone sort is the system select", /aria-label="Sort deals"/.test(list));

const filters = src(`${P}/deal-filter-bar.tsx`);
check("filters: FilterBar + SearchField", /<FilterBar/.test(filters) && /<SearchField/.test(filters));
check("filters: selected filter = Royal Violet", /border-violet-ds-300 bg-accent text-accent-foreground/.test(filters));

const detail = src(`${P}/deal-details-panel.tsx`);
check("detail: system selects for pipeline/stage/priority", (detail.match(/<OptionSelect/g) ?? []).length >= 4);
check("detail: Won / Lost are StatusPills", /<StatusPill tone="success"/.test(detail) && /<StatusPill tone="danger"/.test(detail));
check("detail: Activity + Notes tabs and Next Steps / Upcoming preserved", /\["activity", "notes"\]/.test(detail) && /aria-label="Next steps"/.test(detail) && /aria-label="Upcoming appointment"/.test(detail));
check("detail: delete stays confirm-gated", /Delete this deal\?/.test(detail));

for (const f of [`${P}/new-deal-dialog.tsx`, `${P}/edit-deal-dialog.tsx`]) {
  const s = src(f);
  check(`${f}: currency/pipeline/stage/priority = OptionSelect`, (s.match(/<OptionSelect/g) ?? []).length === 4);
}
check("manage stages: grouped destination = system Select", /<SelectGroupLabel>/.test(src(`${P}/manage-stages-dialog.tsx`)));
check("contact deals: stage chip uses the shared stage dot", /<StageLabel/.test(src("src/components/contacts/contact-deals.tsx")));

console.log(`\nWave 4 pipeline contract: ${pass} passed, ${fail} failed.`);
process.exit(fail ? 1 : 0);
