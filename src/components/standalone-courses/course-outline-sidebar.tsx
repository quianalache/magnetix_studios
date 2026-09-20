"use client";

import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ChevronDown,
  ChevronUp,
  GripVertical,
  Plus,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type {
  StandaloneCourseSection,
  StandaloneLesson,
} from "@/types/standalone-courses";

const UNGROUPED = "__ungrouped__";
const COLLAPSE_STORAGE_PREFIX = "course-outline-collapsed-sections:";

/**
 * Standalone Course builder — left outline sidebar (Course Section UX,
 * 2026-09-20). Extracted from what were two near-identical copies (tenant
 * `sa/[subAccountId]/courses/[courseId]/page.tsx` and Agency
 * `agency/standalone-courses/[courseId]/page.tsx`) into one shared
 * component — same section/lesson behavior in both, per the shared-first
 * Courses rule. The two pages differ only in HOW they own `sections`/
 * `lessons` (tenant: live Firestore subscriptions; Agency: fetch + manual
 * `refresh()`), so this component is fully controlled — it takes both
 * arrays and their React `setState` dispatchers as props, mutates them
 * optimistically, fires the network PATCH(es), then calls the optional
 * `onChanged` (Agency's refresh; tenant passes nothing since its live
 * subscription already delivers the authoritative update moments later).
 *
 * One `DndContext` handles BOTH existing interactions:
 *  - dragging a LESSON onto a section (or the "Other lessons" zone) moves
 *    it there — unchanged from before, still `useDraggable`/`useDroppable`.
 *  - NEW: dragging a SECTION (via its own dedicated handle) reorders
 *    sections — `useSortable` on a `SortableContext` wrapping the section
 *    list. A section's `useSortable` registration is the SAME id a lesson
 *    drop already lands on, so cross-section lesson moves keep working
 *    with no second droppable registration for that id.
 *
 * Lesson reorder WITHIN a section still uses the existing up/down chevron
 * buttons (`LessonNavRow`'s `move()`) — untouched, not drag-based, exactly
 * as before this feature.
 */
export function CourseOutlineSidebar({
  apiBase,
  courseId,
  sections,
  lessons,
  onSectionsChange,
  onLessonsChange,
  selectedId,
  onSelectLesson,
  onAddSection,
  onAddLesson,
  onChanged,
}: {
  apiBase: string;
  courseId: string;
  sections: StandaloneCourseSection[];
  lessons: StandaloneLesson[];
  onSectionsChange: Dispatch<SetStateAction<StandaloneCourseSection[]>>;
  onLessonsChange: Dispatch<SetStateAction<StandaloneLesson[]>>;
  selectedId: string | null;
  onSelectLesson: (id: string) => void;
  onAddSection: () => void;
  onAddLesson: (sectionId: string | null) => void;
  /** Agency has no live Firestore subscription — call after any mutation to
   *  refetch. Tenant omits this; its subscriptions handle it. */
  onChanged?: () => void;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  // Collapse state is presentation-only (task instruction: not course
  // content, no Firestore field) — a per-course localStorage set, same
  // hydrate-after-mount pattern as the dashboard sidebar's own collapsible
  // groups (avoids an SSR/client markup mismatch). Defaults to "all
  // expanded" until hydrated, so existing courses never appear to
  // unexpectedly collapse.
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const storageKey = `${COLLAPSE_STORAGE_PREFIX}${courseId}`;
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(storageKey);
      if (stored) setCollapsed(new Set(JSON.parse(stored) as string[]));
    } catch {
      // Malformed/legacy value — fall back to "all expanded".
    }
  }, [storageKey]);
  function toggleCollapsed(sectionId: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(sectionId)) next.delete(sectionId);
      else next.add(sectionId);
      try {
        window.localStorage.setItem(storageKey, JSON.stringify([...next]));
      } catch {
        // Best-effort only — presentation state, not worth surfacing an error.
      }
      return next;
    });
  }

  const sectionIds = new Set(sections.map((s) => s.id));
  const containerOf = (l: StandaloneLesson) =>
    l.sectionId && sectionIds.has(l.sectionId) ? l.sectionId : UNGROUPED;
  const lessonsIn = (container: string) =>
    lessons
      .filter((l) => containerOf(l) === container)
      .sort((a, b) => a.order - b.order);
  const ungrouped = lessonsIn(UNGROUPED);

  // Dragging a lesson onto a section (or the "no section" zone) moves it
  // there. Reordering WITHIN a section stays on the up/down arrows.
  async function handleLessonDragEnd(lessonId: string, overId: string) {
    const lesson = lessons.find((l) => l.id === lessonId);
    if (!lesson) return;
    const target = overId === UNGROUPED ? null : overId;
    const current =
      containerOf(lesson) === UNGROUPED ? null : containerOf(lesson);
    if (current === target) return;
    const maxOrder = lessons.reduce((m, l) => Math.max(m, l.order), 0);
    onLessonsChange((prev) =>
      prev.map((l) =>
        l.id === lessonId ? { ...l, sectionId: target, order: maxOrder + 1 } : l
      )
    );
    onSelectLesson(lessonId);
    const res = await fetch(`${apiBase}/lessons/${lessonId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sectionId: target, order: maxOrder + 1 }),
    });
    if (res.ok) onChanged?.();
  }

  // Dragging a section (via its own handle) reorders the whole section —
  // its lessons move with it untouched (they're keyed by sectionId, not
  // position). Persists sequential `order` values to every section whose
  // index actually changed, reusing the existing sections PATCH route's
  // already-wired `order` field (see standalone-course-service.ts) — no
  // new endpoint, no new schema field.
  async function handleSectionDragEnd(sectionId: string, overId: string) {
    if (sectionId === overId || !sectionIds.has(overId)) return;
    const oldIndex = sections.findIndex((s) => s.id === sectionId);
    const newIndex = sections.findIndex((s) => s.id === overId);
    if (oldIndex === -1 || newIndex === -1) return;
    const reordered = arrayMove(sections, oldIndex, newIndex);
    onSectionsChange(reordered);
    const changed = reordered
      .map((s, i) => ({ s, i }))
      .filter(({ s, i }) => s.order !== i);
    await Promise.all(
      changed.map(({ s, i }) =>
        fetch(`${apiBase}/sections/${s.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ order: i }),
        })
      )
    );
    onChanged?.();
  }

  function handleDragEnd(e: DragEndEvent) {
    const activeId = String(e.active.id);
    const overId = e.over ? String(e.over.id) : null;
    if (!overId) return;
    if (sectionIds.has(activeId)) {
      void handleSectionDragEnd(activeId, overId);
    } else {
      void handleLessonDragEnd(activeId, overId);
    }
  }

  return (
    <aside className="space-y-2">
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={sections.map((s) => s.id)}
          strategy={verticalListSortingStrategy}
        >
          {sections.map((section) => (
            <SectionBlock
              key={section.id}
              apiBase={apiBase}
              section={section}
              lessons={lessonsIn(section.id)}
              selectedId={selectedId}
              onSelect={onSelectLesson}
              onAddLesson={() => onAddLesson(section.id)}
              onChanged={onChanged}
              collapsed={collapsed.has(section.id)}
              onToggleCollapsed={() => toggleCollapsed(section.id)}
            />
          ))}
        </SortableContext>

        {(ungrouped.length > 0 || sections.length > 0) && (
          <DropZone id={UNGROUPED}>
            {sections.length > 0 && (
              <p className="text-muted-foreground px-1 py-1 text-xs font-medium tracking-wide uppercase">
                Other lessons
              </p>
            )}
            {ungrouped.map((l, i) => (
              <LessonNavRow
                key={l.id}
                apiBase={apiBase}
                lesson={l}
                siblings={ungrouped}
                index={i}
                selected={selectedId === l.id}
                onSelect={() => onSelectLesson(l.id)}
                onChanged={onChanged}
              />
            ))}
            {ungrouped.length === 0 && (
              <p className="text-muted-foreground px-1 py-2 text-xs">
                Drop a lesson here to remove it from its section.
              </p>
            )}
          </DropZone>
        )}
      </DndContext>

      <div className="flex flex-col gap-1 pt-1">
        <Button size="sm" variant="outline" onClick={onAddSection}>
          <Plus className="h-4 w-4" /> Section
        </Button>
        <Button size="sm" variant="ghost" onClick={() => onAddLesson(null)}>
          <Plus className="h-4 w-4" /> Lesson (no section)
        </Button>
      </div>
    </aside>
  );
}

/** A droppable container that highlights while a lesson hovers over it. */
function DropZone({ id, children }: { id: string; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "bg-card rounded-lg border p-2 transition-colors",
        isOver && "border-primary ring-primary ring-1"
      )}
    >
      {children}
    </div>
  );
}

function SectionBlock({
  apiBase,
  section,
  lessons,
  selectedId,
  onSelect,
  onAddLesson,
  onChanged,
  collapsed,
  onToggleCollapsed,
}: {
  apiBase: string;
  section: StandaloneCourseSection;
  lessons: StandaloneLesson[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onAddLesson: () => void;
  onChanged?: () => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
}) {
  const [title, setTitle] = useState(section.title);
  const {
    attributes,
    listeners,
    setNodeRef: setSortableNodeRef,
    transform,
    transition,
    isDragging,
    isOver,
  } = useSortable({ id: section.id });
  // `useSortable` already registers this id as BOTH draggable (section
  // reorder) and droppable (a lesson dragged onto it) internally, and
  // returns `isOver` itself — no separate `useDroppable` call for this id,
  // which would double-register the same id's droppable slot.
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  async function rename() {
    if (title.trim() === section.title) return;
    await fetch(`${apiBase}/sections/${section.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
    onChanged?.();
  }
  async function remove() {
    if (!confirm("Delete this section? Its lessons move to 'Other'.")) return;
    await fetch(`${apiBase}/sections/${section.id}`, { method: "DELETE" });
    onChanged?.();
  }

  return (
    <div
      ref={setSortableNodeRef}
      style={style}
      className={cn(
        "bg-card rounded-lg border p-2 transition-colors",
        isOver && "border-primary ring-primary ring-1",
        isDragging && "opacity-50"
      )}
    >
      <div className="mb-1 flex items-center gap-1">
        <button
          {...attributes}
          {...listeners}
          className="text-muted-foreground/60 hover:text-foreground cursor-grab touch-none active:cursor-grabbing"
          title="Drag to reorder section"
          aria-label="Drag to reorder section"
        >
          <GripVertical className="h-3.5 w-3.5" />
        </button>
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={rename}
          className="h-7 min-w-0 flex-1 border-0 bg-transparent px-1 text-xs font-semibold tracking-wide uppercase focus-visible:ring-1"
        />
        <span className="text-muted-foreground shrink-0 text-[11px] whitespace-nowrap">
          {lessons.length} lesson{lessons.length === 1 ? "" : "s"}
        </span>
        <button
          onClick={onToggleCollapsed}
          className="text-muted-foreground hover:text-foreground shrink-0"
          title={collapsed ? "Expand section" : "Collapse section"}
          aria-label={collapsed ? "Expand section" : "Collapse section"}
          aria-expanded={!collapsed}
        >
          <ChevronDown
            className={cn(
              "h-3.5 w-3.5 transition-transform",
              collapsed && "-rotate-90"
            )}
          />
        </button>
        <button
          onClick={remove}
          className="text-muted-foreground hover:text-destructive shrink-0"
          title="Delete section"
          aria-label="Delete section"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
      {!collapsed && (
        <>
          {lessons.map((l, i) => (
            <LessonNavRow
              key={l.id}
              apiBase={apiBase}
              lesson={l}
              siblings={lessons}
              index={i}
              selected={selectedId === l.id}
              onSelect={() => onSelect(l.id)}
              onChanged={onChanged}
            />
          ))}
          <button
            onClick={onAddLesson}
            className="text-muted-foreground hover:bg-muted mt-1 flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-xs"
          >
            <Plus className="h-3.5 w-3.5" /> Lesson
          </button>
        </>
      )}
    </div>
  );
}

function LessonNavRow({
  apiBase,
  lesson,
  siblings,
  index,
  selected,
  onSelect,
  onChanged,
}: {
  apiBase: string;
  lesson: StandaloneLesson;
  siblings: StandaloneLesson[];
  index: number;
  selected: boolean;
  onSelect: () => void;
  onChanged?: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({ id: lesson.id });
  const style = transform
    ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
        zIndex: 50,
      }
    : undefined;

  async function move(dir: -1 | 1) {
    const other = siblings[index + dir];
    if (!other) return;
    await Promise.all([
      fetch(`${apiBase}/lessons/${lesson.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order: other.order }),
      }),
      fetch(`${apiBase}/lessons/${other.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order: lesson.order }),
      }),
    ]);
    onChanged?.();
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "group flex items-center gap-1 rounded-md px-1",
        selected && "bg-primary/10",
        isDragging && "opacity-50"
      )}
    >
      <button
        {...attributes}
        {...listeners}
        className="text-muted-foreground/60 hover:text-foreground cursor-grab touch-none active:cursor-grabbing"
        title="Drag to a section"
      >
        <GripVertical className="h-3.5 w-3.5" />
      </button>
      <div className="flex flex-col opacity-0 group-hover:opacity-100">
        <button
          onClick={() => move(-1)}
          disabled={index === 0}
          className="text-muted-foreground disabled:opacity-30"
        >
          <ChevronUp className="h-3 w-3" />
        </button>
        <button
          onClick={() => move(1)}
          disabled={index === siblings.length - 1}
          className="text-muted-foreground disabled:opacity-30"
        >
          <ChevronDown className="h-3 w-3" />
        </button>
      </div>
      <button
        onClick={onSelect}
        className={cn(
          "flex-1 truncate py-1.5 text-left text-sm",
          selected ? "text-primary font-medium" : "text-foreground"
        )}
      >
        {lesson.title}
        {!lesson.published && (
          <span className="text-muted-foreground ml-1.5 text-xs">(draft)</span>
        )}
      </button>
    </div>
  );
}
