"use client";

import { useMemo, useState } from "react";
import {
  Lightbulb,
  Zap,
  CalendarDays,
  CircleCheck,
  RefreshCw,
  CircleAlert,
  Rocket,
  Search,
  LayoutGrid,
  List,
  Calendar as CalendarIcon,
  MoreVertical,
  Pencil,
  Trash2,
  Send,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { toDate } from "@/lib/format";
import {
  CONTENT_PLATFORMS,
  CONTENT_PRIORITIES,
  CONTENT_STAGES,
  CONTENT_TYPES,
  stageBucket,
  type ContentItemDoc,
  type ContentStage,
} from "@/types/content-library";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const TYPE_LABEL: Record<string, string> = Object.fromEntries(
  CONTENT_TYPES.map((t) => [t.value, t.label]),
);

const SELECT_CLS =
  "h-9 rounded-full border border-input bg-card px-3 text-xs shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring [&_option]:bg-background [&_option]:text-foreground";

/**
 * Real, exact spec — read directly from "Momentum OS Content.html", the
 * page she saved while logged in (2026-08-08). Every value here (bg
 * token, icon, icon color) is transcribed, not eyeballed from a
 * screenshot: <button class="rounded-2xl p-3 text-left transition-all
 * shadow-sm bg-X cursor-pointer hover:opacity-80">. Icons are plain
 * text-primary across the board — Overdue is the one exception, its
 * icon is text-destructive.
 */
const STAT_CARDS: {
  key: "ideas" | "inProgress" | "scheduled" | "published" | "repurposed" | "overdue" | "thisWeek";
  label: string;
  icon: typeof Lightbulb;
  bg: string;
  iconClass: string;
}[] = [
  { key: "ideas", label: "Ideas", icon: Lightbulb, bg: "bg-card", iconClass: "text-primary" },
  { key: "inProgress", label: "In Progress", icon: Zap, bg: "bg-secondary", iconClass: "text-primary" },
  { key: "scheduled", label: "Scheduled", icon: CalendarDays, bg: "bg-muted", iconClass: "text-primary" },
  { key: "published", label: "Published", icon: CircleCheck, bg: "bg-accent/30", iconClass: "text-primary" },
  { key: "repurposed", label: "Repurposed", icon: RefreshCw, bg: "bg-card", iconClass: "text-primary" },
  { key: "overdue", label: "Overdue", icon: CircleAlert, bg: "bg-destructive/10", iconClass: "text-destructive" },
  { key: "thisWeek", label: "This Week", icon: Rocket, bg: "bg-secondary", iconClass: "text-primary" },
];

/**
 * Column header backgrounds — real values for idea/research/outline/
 * script/scheduled/published confirmed directly from the saved page
 * (2026-08-08); she only captured up to the Script column before the
 * board scrolled off-screen, so recording/editing/assets/repurposed
 * extrapolate the same confirmed 4-token rotation (bg-card/bg-muted/
 * bg-secondary/bg-accent-30) rather than guessing new colors.
 */
const STAGE_BG: Record<string, string> = {
  idea: "bg-card",
  research: "bg-muted",
  outline: "bg-secondary",
  script: "bg-muted",
  recording: "bg-secondary",
  editing: "bg-card",
  assets: "bg-muted",
  scheduled: "bg-accent/30",
  published: "bg-accent/30",
  repurposed: "bg-card",
};

function startOfWeek(d: Date): Date {
  const s = new Date(d);
  s.setHours(0, 0, 0, 0);
  s.setDate(s.getDate() - s.getDay());
  return s;
}

export function PipelineTab({
  items,
  loading,
  isAdmin,
  onEdit,
  onDelete,
  onMove,
  onSchedule,
}: {
  items: ContentItemDoc[];
  loading: boolean;
  isAdmin: boolean;
  onEdit: (item: ContentItemDoc) => void;
  onDelete: (item: ContentItemDoc) => void;
  onMove: (item: ContentItemDoc, stage: ContentStage) => void;
  onSchedule: (item: ContentItemDoc) => void;
}) {
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState<ContentStage | "">("");
  const [platformFilter, setPlatformFilter] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("");
  const [view, setView] = useState<"grid" | "list">("grid");

  const stats = useMemo(() => {
    const now = new Date();
    const weekStart = startOfWeek(now);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 7);
    const counts: Record<string, number> = {
      ideas: 0,
      inProgress: 0,
      scheduled: 0,
      published: 0,
      repurposed: 0,
      overdue: 0,
      thisWeek: 0,
    };
    for (const item of items) {
      counts[stageBucket(item.stage)]++;
      const deadline = toDate(item.deadline);
      if (deadline && deadline < now && item.stage !== "published") counts.overdue++;
      const publish = toDate(item.publishDate);
      if (publish && publish >= weekStart && publish < weekEnd) counts.thisWeek++;
    }
    return counts;
  }, [items]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((item) => {
      if (q && !item.title.toLowerCase().includes(q) && !item.hook.toLowerCase().includes(q)) {
        return false;
      }
      if (stageFilter && item.stage !== stageFilter) return false;
      if (platformFilter && item.platform !== platformFilter) return false;
      if (priorityFilter && item.priority !== priorityFilter) return false;
      return true;
    });
  }, [items, search, stageFilter, platformFilter, priorityFilter]);

  const byStage = useMemo(() => {
    const m = new Map<ContentStage, ContentItemDoc[]>();
    for (const s of CONTENT_STAGES) m.set(s.value, []);
    for (const item of filtered) m.get(item.stage)?.push(item);
    return m;
  }, [filtered]);

  if (loading) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-40 animate-pulse rounded-xl border bg-muted/30" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        {STAT_CARDS.map((s) => (
          <div
            key={s.key}
            className={`rounded-2xl p-3 text-left shadow-sm transition-all hover:opacity-80 ${s.bg}`}
          >
            <div className="mb-1 flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">{s.label}</span>
              <s.icon className={`h-3.5 w-3.5 ${s.iconClass}`} />
            </div>
            <div className="text-2xl font-bold text-foreground">{stats[s.key]}</div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search content..."
            className="rounded-full bg-card pl-8"
          />
        </div>
        <select value={stageFilter} onChange={(e) => setStageFilter(e.target.value as ContentStage | "")} className={SELECT_CLS}>
          <option value="">Stage</option>
          {CONTENT_STAGES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.emoji} {s.label}
            </option>
          ))}
        </select>
        <select value={platformFilter} onChange={(e) => setPlatformFilter(e.target.value)} className={SELECT_CLS}>
          <option value="">Platform</option>
          {CONTENT_PLATFORMS.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <select value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)} className={`${SELECT_CLS} capitalize`}>
          <option value="">Priority</option>
          {CONTENT_PRIORITIES.map((p) => (
            <option key={p} value={p} className="capitalize">
              {p}
            </option>
          ))}
        </select>
        <div className="ml-auto flex items-center gap-1 rounded-full bg-muted/60 p-1">
          <button
            type="button"
            onClick={() => setView("grid")}
            className={`rounded-full p-1.5 ${view === "grid" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"}`}
            aria-label="Grid view"
          >
            <LayoutGrid className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setView("list")}
            className={`rounded-full p-1.5 ${view === "list" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"}`}
            aria-label="List view"
          >
            <List className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => toast("Calendar view is coming soon.")}
            className="rounded-full p-1.5 text-muted-foreground"
            aria-label="Calendar view"
          >
            <CalendarIcon className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed p-14 text-center">
          <Sparkles className="mx-auto mb-3 h-6 w-6 text-muted-foreground" />
          <h2 className="text-base font-semibold">No content found</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Try adjusting your filters or add new content.
          </p>
        </div>
      ) : view === "list" ? (
        <ul className="space-y-2">
          {filtered.map((item) => (
            <ListRow key={item.id} item={item} isAdmin={isAdmin} onEdit={() => onEdit(item)} onDelete={() => onDelete(item)} onMove={(s) => onMove(item, s)} onSchedule={() => onSchedule(item)} />
          ))}
        </ul>
      ) : (
        <div className="grid gap-3 overflow-x-auto pb-2 lg:grid-cols-[repeat(10,minmax(200px,1fr))]">
          {CONTENT_STAGES.map((stage) => {
            const stageItems = byStage.get(stage.value) ?? [];
            return (
              <div key={stage.value} className="min-w-[200px] space-y-2">
                <div
                  className={`flex items-center justify-between rounded-xl px-3 py-2 transition-all ${STAGE_BG[stage.value] ?? "bg-card"}`}
                >
                  <span className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                    <span>{stage.emoji}</span> {stage.label}
                  </span>
                  <span className="rounded-full bg-background/60 px-1.5 py-0.5 text-xs text-muted-foreground">
                    {stageItems.length}
                  </span>
                </div>
                <div className="space-y-2">
                  {stageItems.map((item) => (
                    <ContentCard
                      key={item.id}
                      item={item}
                      isAdmin={isAdmin}
                      onEdit={() => onEdit(item)}
                      onDelete={() => onDelete(item)}
                      onMove={(s) => onMove(item, s)}
                      onSchedule={() => onSchedule(item)}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function CardActions({
  item,
  isAdmin,
  onEdit,
  onDelete,
  onMove,
}: {
  item: ContentItemDoc;
  isAdmin: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onMove: (stage: ContentStage) => void;
}) {
  if (!isAdmin) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="ghost" size="sm" aria-label="Content actions" className="h-6 w-6 p-0">
            <MoreVertical className="h-3.5 w-3.5" />
          </Button>
        }
      />
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={onEdit}>
          <Pencil className="mr-2 h-3.5 w-3.5" />
          Edit
        </DropdownMenuItem>
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>Move to</DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            {CONTENT_STAGES.filter((s) => s.value !== item.stage).map((s) => (
              <DropdownMenuItem key={s.value} onClick={() => onMove(s.value)}>
                {s.emoji} {s.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onDelete} className="text-destructive focus:text-destructive">
          <Trash2 className="mr-2 h-3.5 w-3.5" />
          Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ContentCard({
  item,
  isAdmin,
  onEdit,
  onDelete,
  onMove,
  onSchedule,
}: {
  item: ContentItemDoc;
  isAdmin: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onMove: (stage: ContentStage) => void;
  onSchedule: () => void;
}) {
  const doneCount = item.checklist.filter((c) => c.done).length;

  return (
    <div className="rounded-xl border bg-card p-3">
      <div className="flex items-start justify-between gap-2">
        <button
          type="button"
          onClick={onEdit}
          className="min-w-0 flex-1 text-left text-sm font-semibold hover:text-primary hover:underline"
        >
          {item.isFocus && "⭐ "}
          {item.title}
        </button>
        <CardActions item={item} isAdmin={isAdmin} onEdit={onEdit} onDelete={onDelete} onMove={onMove} />
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <span className="rounded-full bg-accent/40 px-2 py-0.5 text-[10.5px] font-medium text-accent-foreground">
          {TYPE_LABEL[item.contentType] ?? item.contentType}
        </span>
        <span className="rounded-full bg-secondary px-2 py-0.5 text-[10.5px] font-medium capitalize text-secondary-foreground">
          {item.priority}
        </span>
      </div>

      {item.hook && <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{item.hook}</p>}

      {item.checklist.length > 0 && (
        <p className="mt-1.5 text-[10.5px] text-muted-foreground">
          {doneCount}/{item.checklist.length} checklist items
        </p>
      )}

      {!item.linkedSocialPostId && isAdmin && (
        <Button variant="outline" size="sm" className="mt-3 w-full rounded-full" onClick={onSchedule}>
          <Send className="mr-1 h-3.5 w-3.5" />
          Schedule this
        </Button>
      )}
    </div>
  );
}

function ListRow({
  item,
  isAdmin,
  onEdit,
  onDelete,
  onMove,
  onSchedule,
}: {
  item: ContentItemDoc;
  isAdmin: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onMove: (stage: ContentStage) => void;
  onSchedule: () => void;
}) {
  const stageMeta = CONTENT_STAGES.find((s) => s.value === item.stage);
  return (
    <li className="flex items-center justify-between gap-3 rounded-xl border bg-card p-3">
      <div className="flex min-w-0 items-center gap-3">
        <span className="text-lg">{stageMeta?.emoji}</span>
        <div className="min-w-0">
          <button type="button" onClick={onEdit} className="truncate text-left text-sm font-semibold hover:text-primary hover:underline">
            {item.isFocus && "⭐ "}
            {item.title}
          </button>
          <p className="truncate text-xs text-muted-foreground">
            {TYPE_LABEL[item.contentType] ?? item.contentType} · {item.platform} · {stageMeta?.label}
          </p>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {!item.linkedSocialPostId && isAdmin && (
          <Button variant="outline" size="sm" className="rounded-full" onClick={onSchedule}>
            <Send className="h-3.5 w-3.5" />
          </Button>
        )}
        <CardActions item={item} isAdmin={isAdmin} onEdit={onEdit} onDelete={onDelete} onMove={onMove} />
      </div>
    </li>
  );
}
