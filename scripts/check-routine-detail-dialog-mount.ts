import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const route = readFileSync(
  "src/app/(dashboard)/sa/[subAccountId]/projects/routines/[routineId]/page.tsx",
  "utf8",
);
const taskDetail = readFileSync("src/components/tasks/detail/task-detail-modal.tsx", "utf8");

// Base UI error #26 is Dialog.Portal being rendered without its dialog
// context. Closed dialogs on this route must not mount their Portal content.
assert.match(route, /\{editing && \(\s*<RoutineEditorDialog/);
assert.match(route, /\{deleting && \(\s*<Dialog open/);
assert.match(taskDetail, /if \(!open \|\| !currentId\) return null;/);
assert.match(taskDetail, /<Dialog open onOpenChange=\{onOpenChange\}>/);

console.log("Routine detail dialog mount regression checks: 4/4 passed");
