import recovered from "./momentum-os-system-templates.json";
import {
  projectTemplateAudience,
  type ProjectTemplate,
  type ProjectTemplateAudience,
} from "@/types/projects";

/**
 * Template Library view model (Projects redesign, Phase 1).
 *
 * Two sources feed the library, and they are kept strictly apart:
 *
 * 1. **System templates** — the 8 original Momentum OS templates, recovered
 *    verbatim from the compiled Momentum OS bundle (see
 *    docs/projects-restoration/README.md on the `docs/projects-restoration`
 *    branch). The JSON next to this file is a byte-for-byte copy of that
 *    canonical data. They are bundled with the app and READ-ONLY: nothing
 *    here writes them to Firestore, so the existing `projectTemplates`
 *    records (including the 9 seeded in 2026-08) are never touched,
 *    merged or replaced.
 * 2. **Workspace templates** — the sub-account's existing `projectTemplates`
 *    records, unchanged. Their `steps` render as the template's tasks.
 *
 * Only the mapping to camelCase happens here; no value is invented. Fields
 * the original never authored (task descriptions, suggested goals, notes)
 * stay absent, and `offset_label` is preserved verbatim.
 */

export type TemplatePriority = "low" | "medium" | "high";
export type TemplateTimeBlock = "AM" | "Midday" | "PM" | "Anytime";

export interface LibraryTask {
  title: string;
  priority: TemplatePriority | null;
  timeBlock: TemplateTimeBlock | null;
  estimatedMinutes: number | null;
  /** 0-based: Day 0 = project start date. Null for workspace steps (no scheduling). */
  dayOffset: number | null;
  /** Free-text label as authored ("Day 1", "Launch day", "After publish"). */
  offsetLabel: string | null;
  tags: string[];
}

export interface LibraryMilestone {
  title: string;
  dayOffset: number;
  offsetLabel: string | null;
}

export interface LibraryRoutine {
  title: string;
  description: string;
  recurrenceType: string;
  timeBlock: TemplateTimeBlock | null;
  estimatedMinutes: number | null;
}

export interface LibraryTemplate {
  /** Stable key — the recovered `sys_*` id, or `ws:<projectTemplates id>`. Also the favorite key. */
  key: string;
  source: "system" | "workspace";
  name: string;
  description: string;
  categoryKey: string;
  categoryLabel: string;
  durationDays: number | null;
  tags: string[];
  tasks: LibraryTask[];
  milestones: LibraryMilestone[];
  routines: LibraryRoutine[];
  /** Workspace templates only. */
  audience: ProjectTemplateAudience | null;
  workspaceTemplate: ProjectTemplate | null;
}

type RecoveredTask = {
  title: string;
  priority: TemplatePriority;
  time_block: TemplateTimeBlock;
  estimated_minutes: number | null;
  day_offset: number;
  offset_label?: string | null;
  tags?: string[];
};
type RecoveredMilestone = {
  title: string;
  day_offset: number;
  offset_label?: string | null;
};
type RecoveredRoutine = {
  title: string;
  description?: string;
  recurrence_type: string;
  time_block: TemplateTimeBlock;
  estimated_minutes: number | null;
};
type RecoveredTemplate = {
  id: string;
  name: string;
  description: string;
  category: string;
  estimated_days: number | null;
  tags: string[];
  tasks: RecoveredTask[];
  milestones: RecoveredMilestone[];
  routines: RecoveredRoutine[];
};

const ENUMS = recovered.enums;

/** Original category order (`X$`) and labels (`ph`), emoji included. */
export const TEMPLATE_CATEGORY_ORDER: string[] = ENUMS.categories.order;
export const TEMPLATE_CATEGORY_LABELS: Record<string, string> =
  ENUMS.categories.labels;
export const TEMPLATE_RECURRENCE_LABELS: Record<string, string> =
  ENUMS.recurrence.labels;

function stripEmoji(label: string): string {
  return label.replace(/^[^\p{L}\p{N}]+/u, "").trim();
}

/** Plain-text category label ("Content Workflow"), used for chips + matching. */
export function categoryPlainLabel(key: string): string {
  const label = TEMPLATE_CATEGORY_LABELS[key];
  return label ? stripEmoji(label) : key;
}

const LABEL_TO_CATEGORY = new Map(
  Object.entries(TEMPLATE_CATEGORY_LABELS).map(([key, label]) => [
    stripEmoji(label).toLowerCase(),
    key,
  ])
);

/**
 * Workspace templates store `category` as free text. The 2026-08 seed wrote
 * the original display labels ("Content Workflow"), so a label that matches
 * a Momentum OS category joins that category's chip; anything else gets its
 * own chip keyed by its text. Display only — the stored value is untouched.
 */
function resolveWorkspaceCategory(raw: string): { key: string; label: string } {
  const text = raw.trim();
  if (!text) return { key: "uncategorized", label: "No category" };
  const known = LABEL_TO_CATEGORY.get(text.toLowerCase());
  if (known) return { key: known, label: categoryPlainLabel(known) };
  return { key: `text:${text.toLowerCase()}`, label: text };
}

export const SYSTEM_TEMPLATES: LibraryTemplate[] = (
  recovered.templates as RecoveredTemplate[]
).map((t) => ({
  key: t.id,
  source: "system",
  name: t.name,
  description: t.description,
  categoryKey: t.category,
  categoryLabel: categoryPlainLabel(t.category),
  durationDays: t.estimated_days,
  tags: t.tags ?? [],
  tasks: t.tasks.map((task) => ({
    title: task.title,
    priority: task.priority,
    timeBlock: task.time_block,
    estimatedMinutes: task.estimated_minutes ?? null,
    dayOffset: task.day_offset,
    offsetLabel: task.offset_label ?? null,
    tags: task.tags ?? [],
  })),
  milestones: t.milestones.map((m) => ({
    title: m.title,
    dayOffset: m.day_offset,
    offsetLabel: m.offset_label ?? null,
  })),
  routines: t.routines.map((r) => ({
    title: r.title,
    description: r.description ?? "",
    recurrenceType: r.recurrence_type,
    timeBlock: r.time_block,
    estimatedMinutes: r.estimated_minutes ?? null,
  })),
  audience: null,
  workspaceTemplate: null,
}));

export function workspaceTemplateToLibrary(
  t: ProjectTemplate
): LibraryTemplate {
  const category = resolveWorkspaceCategory(t.category ?? "");
  return {
    key: `ws:${t.id}`,
    source: "workspace",
    name: t.title,
    description: t.description ?? "",
    categoryKey: category.key,
    categoryLabel: category.label,
    durationDays: t.durationDays ?? null,
    tags: [],
    tasks: [...(t.steps ?? [])]
      .sort((a, b) => a.order - b.order)
      .map((s) => ({
        title: s.title,
        priority: null,
        timeBlock: null,
        estimatedMinutes: null,
        dayOffset: null,
        offsetLabel: null,
        tags: [],
      })),
    milestones: [],
    routines: [],
    audience: projectTemplateAudience(t),
    workspaceTemplate: t,
  };
}

export function totalEstimatedMinutes(t: LibraryTemplate): number {
  return t.tasks.reduce((sum, task) => sum + (task.estimatedMinutes ?? 0), 0);
}

/** Original estimate formatting: ≥60 min → "1.5h", else "45m". */
export function formatEstimate(minutes: number | null): string | null {
  if (!minutes) return null;
  return minutes >= 60 ? `${(minutes / 60).toFixed(1)}h` : `${minutes}m`;
}

export interface TimelineDay {
  day: number;
  items: {
    type: "task" | "milestone";
    title: string;
    priority: TemplatePriority | null;
  }[];
}

/**
 * The original Timeline Overview (`CSe`) data: tasks + milestones merged and
 * grouped by `day_offset`. Returns [] when the template has no scheduled
 * items or no duration (the original hid the timeline in both cases).
 */
export function buildTimeline(t: LibraryTemplate): TimelineDay[] {
  if (!t.durationDays || t.durationDays <= 0) return [];
  const entries = [
    ...t.tasks
      .filter((task) => task.dayOffset !== null)
      .map((task) => ({
        day: task.dayOffset as number,
        type: "task" as const,
        title: task.title,
        priority: task.priority,
      })),
    ...t.milestones.map((m) => ({
      day: m.dayOffset,
      type: "milestone" as const,
      title: m.title,
      priority: "high" as TemplatePriority,
    })),
  ].sort((a, b) => a.day - b.day);
  const days = [...new Set(entries.map((e) => e.day))].sort((a, b) => a - b);
  return days.map((day) => ({
    day,
    items: entries
      .filter((e) => e.day === day)
      .map(({ type, title, priority }) => ({ type, title, priority })),
  }));
}
