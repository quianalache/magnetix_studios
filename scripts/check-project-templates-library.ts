/**
 * Template Library data checks (Projects redesign, Phase 1). Pure — no
 * database, no network. Verifies the bundled Momentum OS system templates
 * are the recovered data, unmodified, and that the library view model maps
 * them (and legacy workspace templates) without inventing or dropping
 * anything.
 *
 * Run: pnpm exec tsx scripts/check-project-templates-library.ts
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  SYSTEM_TEMPLATES,
  buildTimeline,
  totalEstimatedMinutes,
  workspaceTemplateToLibrary,
} from "../src/lib/projects/template-library";
import type { ProjectTemplate } from "../src/types/projects";

let passes = 0;
function check(label: string, fn: () => void) {
  fn();
  passes++;
  console.log(`PASS  ${label}`);
}

// sha256 of docs/projects-restoration/momentum-os-system-templates.json at
// recovery commit 946fa0e (branch docs/projects-restoration).
const RECOVERED_SHA256 =
  "f3cfbdcb6a63a3de5dd3a7148603ae35febdbb136d93944c63a95fef0f5aaa37";

const jsonPath = join(
  __dirname,
  "../src/lib/projects/momentum-os-system-templates.json"
);
const raw = readFileSync(jsonPath);
const recovered = JSON.parse(raw.toString("utf8"));

check("bundled JSON is byte-identical to the recovery commit", () => {
  assert.equal(createHash("sha256").update(raw).digest("hex"), RECOVERED_SHA256);
});

check("8 system templates, 72 tasks, 17 milestones, 3 routines", () => {
  assert.equal(SYSTEM_TEMPLATES.length, 8);
  const sum = (f: (t: (typeof SYSTEM_TEMPLATES)[number]) => number) =>
    SYSTEM_TEMPLATES.reduce((s, t) => s + f(t), 0);
  assert.equal(sum((t) => t.tasks.length), 72);
  assert.equal(sum((t) => t.milestones.length), 17);
  assert.equal(sum((t) => t.routines.length), 3);
});

check("every field value maps 1:1 from the recovered data", () => {
  for (const [i, src] of recovered.templates.entries()) {
    const t = SYSTEM_TEMPLATES[i];
    assert.equal(t.key, src.id);
    assert.equal(t.source, "system");
    assert.equal(t.name, src.name);
    assert.equal(t.description, src.description);
    assert.equal(t.categoryKey, src.category);
    assert.equal(t.durationDays, src.estimated_days);
    assert.deepEqual(t.tags, src.tags);
    src.tasks.forEach((task: Record<string, unknown>, j: number) => {
      const m = t.tasks[j];
      assert.equal(m.title, task.title);
      assert.equal(m.priority, task.priority);
      assert.equal(m.timeBlock, task.time_block);
      assert.equal(m.estimatedMinutes, task.estimated_minutes);
      assert.equal(m.dayOffset, task.day_offset);
      assert.equal(m.offsetLabel, task.offset_label);
      assert.deepEqual(m.tags, task.tags);
    });
    src.milestones.forEach((ms: Record<string, unknown>, j: number) => {
      assert.equal(t.milestones[j].title, ms.title);
      assert.equal(t.milestones[j].dayOffset, ms.day_offset);
      assert.equal(t.milestones[j].offsetLabel, ms.offset_label);
    });
    src.routines.forEach((r: Record<string, unknown>, j: number) => {
      assert.equal(t.routines[j].title, r.title);
      assert.equal(t.routines[j].description, r.description);
      assert.equal(t.routines[j].recurrenceType, r.recurrence_type);
      assert.equal(t.routines[j].timeBlock, r.time_block);
      assert.equal(t.routines[j].estimatedMinutes, r.estimated_minutes);
    });
  }
});

check("no invented task descriptions / goals / notes", () => {
  for (const t of SYSTEM_TEMPLATES) {
    for (const task of t.tasks) assert.ok(!("description" in task));
    assert.ok(!("notes" in t) && !("suggestedGoals" in t));
  }
});

check("original data quirks preserved (offsets past duration, free-text labels)", () => {
  const launch = SYSTEM_TEMPLATES.find((t) => t.key === "sys_product_launch")!;
  const debrief = launch.tasks.find((t) => t.title === "Launch debrief & metrics review")!;
  assert.equal(debrief.dayOffset, 32);
  assert.equal(launch.durationDays, 30);
  const yt = SYSTEM_TEMPLATES.find((t) => t.key === "sys_youtube_video")!;
  assert.equal(yt.tasks.find((t) => t.title === "Write email about the video")!.dayOffset, 15);
  assert.equal(yt.tasks.find((t) => t.title === "Repurpose: cut Shorts & Reels")!.offsetLabel, "After publish");
});

check("per-template workload matches the recovered summary", () => {
  for (const s of recovered.summary) {
    const t = SYSTEM_TEMPLATES.find((x) => x.key === s.id)!;
    assert.equal(totalEstimatedMinutes(t), s.total_estimated_minutes);
  }
});

check("timeline groups tasks + milestones by day_offset, ascending", () => {
  const yt = SYSTEM_TEMPLATES.find((t) => t.key === "sys_youtube_video")!;
  const days = buildTimeline(yt);
  assert.deepEqual(days.map((d) => d.day), [0, 1, 2, 3, 5, 7, 9, 11, 13, 14, 15]);
  const day7 = days.find((d) => d.day === 7)!;
  assert.deepEqual(day7.items.map((i) => i.type).sort(), ["milestone", "task"]);
  const itemCount = days.reduce((s, d) => s + d.items.length, 0);
  assert.equal(itemCount, yt.tasks.length + yt.milestones.length);
});

// A record shaped exactly like the 2026-08 seed: display-label category,
// empty description, no steps, NO audience field.
const legacySeed = {
  id: "legacy1",
  agencyId: "ag1",
  subAccountId: "sa1",
  title: "YouTube Video Workflow",
  category: "Content Workflow",
  durationDays: 14,
  description: "",
  steps: [],
  createdAt: null,
  updatedAt: null,
} as unknown as ProjectTemplate;

check("legacy seeded workspace template maps without changes", () => {
  const before = JSON.stringify(legacySeed);
  const lib = workspaceTemplateToLibrary(legacySeed);
  assert.equal(JSON.stringify(legacySeed), before, "input must not be mutated");
  assert.equal(lib.key, "ws:legacy1");
  assert.equal(lib.source, "workspace");
  assert.equal(lib.name, "YouTube Video Workflow");
  assert.equal(lib.categoryKey, "content_workflow");
  assert.equal(lib.audience, "internal"); // missing audience reads as internal
  assert.equal(lib.tasks.length, 0);
  assert.equal(lib.workspaceTemplate, legacySeed);
  assert.deepEqual(buildTimeline(lib), []); // no schedule → no timeline
});

check("workspace system-name twin stays a SEPARATE entry (never merged)", () => {
  const lib = workspaceTemplateToLibrary(legacySeed);
  const sys = SYSTEM_TEMPLATES.find((t) => t.name === legacySeed.title)!;
  assert.notEqual(lib.key, sys.key);
});

check("unknown free-text category + client audience + steps in order", () => {
  const lib = workspaceTemplateToLibrary({
    ...legacySeed,
    id: "c1",
    title: "Onboarding",
    category: "Client Onboarding",
    audience: "client",
    steps: [
      { title: "Second", order: 1 },
      { title: "First", order: 0 },
    ],
  } as ProjectTemplate);
  assert.equal(lib.categoryKey, "text:client onboarding");
  assert.equal(lib.categoryLabel, "Client Onboarding");
  assert.equal(lib.audience, "client");
  assert.deepEqual(lib.tasks.map((t) => t.title), ["First", "Second"]);
});

console.log(`\n${passes} passed, 0 failed`);
