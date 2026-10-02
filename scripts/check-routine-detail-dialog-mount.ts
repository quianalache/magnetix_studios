import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const route = readFileSync(
  "src/app/(dashboard)/sa/[subAccountId]/projects/routines/[routineId]/page.tsx",
  "utf8",
);
const taskDetail = readFileSync("src/components/tasks/detail/task-detail-modal.tsx", "utf8");
const sheet = readFileSync("src/components/ui/sheet.tsx", "utf8");

// Base UI error #26 is Dialog.Portal being rendered without its dialog
// context. Closed dialogs on this route must not mount their Portal content.
assert.match(route, /\{editing && \(\s*<RoutineEditorDialog/);
assert.match(route, /\{deleting && \(\s*<Dialog open/);
assert.match(taskDetail, /if \(!open \|\| !currentId\) return null;/);
assert.match(taskDetail, /<Dialog open onOpenChange=\{onOpenChange\}>/);
assert.match(sheet, /if \(inline\)/);
assert.match(sheet, /return \(\s*<div\s+data-slot="sheet-content"/);
assert.match(sheet, /return <SheetPortal><SheetOverlay \/>\{popup\}<\/SheetPortal>/);
assert.doesNotMatch(sheet, /return inline \? popup/);

console.log("Routine detail dialog and inline sheet regression checks: 8/8 passed");
