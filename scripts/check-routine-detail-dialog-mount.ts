import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const route = readFileSync(
  "src/app/(dashboard)/sa/[subAccountId]/projects/routines/[routineId]/page.tsx",
  "utf8",
);
const detail = readFileSync("src/components/routines/routine-detail-sheet.tsx", "utf8");
const taskDetail = readFileSync("src/components/tasks/detail/task-detail-modal.tsx", "utf8");
const sheet = readFileSync("src/components/ui/sheet.tsx", "utf8");

// The Routine Workspace is a page, not a drawer. Its content must not inherit
// Sheet sizing or portal layout rules, while actual Sheet consumers retain the
// Base UI portal paths.
assert.match(route, /max-w-7xl/);
assert.doesNotMatch(route, /embedded/);
assert.match(detail, /<main\s+aria-label="Routine workspace"/);
assert.doesNotMatch(detail, /from "@\/components\/ui\/sheet"/);
assert.match(detail, /Back to Routines/);
assert.match(detail, /role="tablist"[\s\S]*aria-label="Routine sections"/);
assert.match(route, /\{editing && \(\s*<RoutineEditorDialog/);
assert.match(route, /\{deleting && \(\s*<Dialog open/);
assert.match(taskDetail, /if \(!open \|\| !currentId\) return null;/);
assert.match(taskDetail, /<Dialog open onOpenChange=\{onOpenChange\}>/);
assert.match(sheet, /if \(inline\)/);
assert.match(sheet, /<SheetPortal container=\{inlineContainer\}>\{popup\}<\/SheetPortal>/);
assert.match(sheet, /return <SheetPortal><SheetOverlay \/>\{popup\}<\/SheetPortal>/);
assert.doesNotMatch(sheet, /return inline \? popup/);

console.log("Routine workspace structure and Sheet regression checks: 12/12 passed");
