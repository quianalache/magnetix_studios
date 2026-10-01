"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Archive,
  ArchiveRestore,
  ArrowUpDown,
  ExternalLink,
  FolderKanban,
  LayoutGrid,
  List,
  MoreHorizontal,
  Pencil,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import { useSubAccount } from "@/context/sub-account-context";
import { toDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ProjectCard } from "@/components/projects/project-card";
import {
  Pagination,
  usePaged,
} from "@/components/projects/projects-shell";
import { projectProgressPct, type Project } from "@/types/projects";

type TypeFilter = "all" | "internal" | "client";
type ProgressFilter = "all" | "not_started" | "in_progress" | "complete";
type SortKey = "due" | "start" | "created" | "name" | "progress";
type ViewMode = "list" | "grid";

const PAGE_SIZE = 10;
const VIEW_STORAGE_KEY = "mx_projects_view";

const SORT_LABELS: Record<SortKey, string> = {
  due: "Due date",
  start: "Start date",
  created: "Recently created",
  name: "Name",
  progress: "Progress",
};

function millis(v: unknown): number | null {
  const d = toDate(v as Parameters<typeof toDate>[0]);
  return d ? d.getTime() : null;
}

function formatDay(v: unknown): string {
  const d = toDate(v as Parameters<typeof toDate>[0]);
  return d
    ? d.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "—";
}

export async function setProjectStatus(
  subAccountId: string,
  project: Project,
  status: "active" | "archived"
): Promise<boolean> {
  try {
    const res = await fetch(
      `/api/sub-accounts/${subAccountId}/projects/${project.id}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      }
    );
    if (!res.ok) throw new Error();
    toast.success(
      status === "archived" ? "Project archived" : "Project reactivated"
    );
    return true;
  } catch {
    toast.error("Couldn't update this project.");
    return false;
  }
}

export function TypePill({ project }: { project: Project }) {
  const client = !!project.assignedContactId;
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium",
        client
          ? "bg-teal-500/10 text-teal-700 dark:text-teal-300"
          : "bg-violet-500/10 text-violet-700 dark:text-violet-300"
      )}
    >
      {client ? "Client" : "Internal"}
    </span>
  );
}

function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase())
      .join("") || "?"
  );
}

export function AssigneeCell({ project }: { project: Project }) {
  if (!project.assignedContactId) {
    return <span className="text-muted-foreground text-sm">Internal</span>;
  }
  const name = project.assignedContactName || "Client";
  return (
    <span className="flex min-w-0 items-center gap-2" title={name}>
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-violet-500/10 text-xs font-semibold text-violet-700 dark:text-violet-300">
        {initials(name)}
      </span>
      <span className="truncate text-sm">{name}</span>
    </span>
  );
}

function progressBarTone(index: number): string {
  // Aqua Glow is the primary progress signal; the pale brand accents remain
  // available for surrounding metadata without turning the board pink.
  void index;
  return "bg-[#9EDBDD]";
}

export function ProjectsList({
  projects,
  mode,
  loading,
  onEdit,
  emptyState,
}: {
  projects: Project[];
  mode: "active" | "archived";
  loading: boolean;
  onEdit: (project: Project) => void;
  emptyState: React.ReactNode;
}) {
  const router = useRouter();
  const { subAccountId, saPath } = useSubAccount();
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [progressFilter, setProgressFilter] = useState<ProgressFilter>("all");
  const [sort, setSort] = useState<SortKey>(
    mode === "archived" ? "created" : "due"
  );
  const [view, setView] = useState<ViewMode>("list");
  const [page, setPage] = useState(1);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(VIEW_STORAGE_KEY);
      if (stored === "grid" || stored === "list") setView(stored);
    } catch {
      /* per-viewer convenience only */
    }
  }, []);
  function changeView(v: ViewMode) {
    setView(v);
    try {
      localStorage.setItem(VIEW_STORAGE_KEY, v);
    } catch {
      /* ignore */
    }
  }

  useEffect(() => setPage(1), [search, typeFilter, progressFilter, sort]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = projects.filter((p) => {
      if (typeFilter === "client" && !p.assignedContactId) return false;
      if (typeFilter === "internal" && p.assignedContactId) return false;
      if (progressFilter !== "all") {
        const pct = projectProgressPct(p);
        if (progressFilter === "not_started" && pct !== 0) return false;
        if (progressFilter === "in_progress" && (pct === 0 || pct === 100))
          return false;
        if (progressFilter === "complete" && pct !== 100) return false;
      }
      if (!q) return true;
      return (
        p.title.toLowerCase().includes(q) ||
        (p.description ?? "").toLowerCase().includes(q) ||
        (p.assignedContactName ?? "").toLowerCase().includes(q)
      );
    });
    const nullsLast = (a: number | null, b: number | null) =>
      a === null ? (b === null ? 0 : 1) : b === null ? -1 : a - b;
    list.sort((a, b) => {
      switch (sort) {
        case "due":
          return nullsLast(millis(a.dueAt), millis(b.dueAt));
        case "start":
          return nullsLast(millis(a.startAt), millis(b.startAt));
        case "name":
          return a.title.localeCompare(b.title);
        case "progress":
          return projectProgressPct(b) - projectProgressPct(a);
        case "created":
        default:
          return (millis(b.createdAt) ?? 0) - (millis(a.createdAt) ?? 0);
      }
    });
    return list;
  }, [projects, search, typeFilter, progressFilter, sort]);

  const paged = usePaged(filtered, PAGE_SIZE, page);
  const activeFilterCount =
    (typeFilter !== "all" ? 1 : 0) + (progressFilter !== "all" ? 1 : 0);

  const title = mode === "archived" ? "Archived projects" : "Projects";

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        <h2 className="text-2xl font-semibold tracking-tight">
          {title}{" "}
          <span className="text-muted-foreground font-normal">
            ({projects.length})
          </span>
        </h2>
        <div className="flex flex-wrap items-center gap-2 lg:ml-auto">
          <div className="relative w-full sm:w-60">
            <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search projects…"
              aria-label="Search projects"
              className="h-10 pl-9"
            />
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={<Button variant="outline" className="h-10" />}
            >
              <SlidersHorizontal className="mr-1.5 h-4 w-4" />
              Filter
              {activeFilterCount > 0 && (
                <span className="bg-primary text-primary-foreground ml-1.5 rounded-full px-1.5 text-[11px]">
                  {activeFilterCount}
                </span>
              )}
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <p className="text-muted-foreground px-2 pt-1.5 pb-1 text-xs font-medium">
                Type
              </p>
              {(
                [
                  ["all", "All projects"],
                  ["internal", "Internal"],
                  ["client", "Client"],
                ] as [TypeFilter, string][]
              ).map(([v, label]) => (
                <DropdownMenuItem key={v} onClick={() => setTypeFilter(v)}>
                  <span className={cn(typeFilter === v && "font-semibold")}>
                    {label}
                  </span>
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <p className="text-muted-foreground px-2 pt-1.5 pb-1 text-xs font-medium">
                Progress
              </p>
              {(
                [
                  ["all", "Any progress"],
                  ["not_started", "Not started"],
                  ["in_progress", "In progress"],
                  ["complete", "Complete"],
                ] as [ProgressFilter, string][]
              ).map(([v, label]) => (
                <DropdownMenuItem key={v} onClick={() => setProgressFilter(v)}>
                  <span
                    className={cn(progressFilter === v && "font-semibold")}
                  >
                    {label}
                  </span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <label className="bg-background flex h-10 items-center gap-2 rounded-lg border px-3 text-sm">
            <ArrowUpDown className="text-muted-foreground h-4 w-4" />
            <span className="text-muted-foreground">Sort:</span>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as SortKey)}
              aria-label="Sort projects"
              className="[&_option]:bg-background [&_option]:text-foreground bg-transparent font-medium outline-none"
            >
              {(Object.keys(SORT_LABELS) as SortKey[]).map((k) => (
                <option key={k} value={k}>
                  {SORT_LABELS[k]}
                </option>
              ))}
            </select>
          </label>
          <div
            className="flex items-center gap-1 rounded-lg border p-1"
            role="group"
            aria-label="Display"
          >
            <Button
              variant={view === "list" ? "secondary" : "ghost"}
              size="icon"
              className="h-8 w-8"
              aria-label="List view"
              aria-pressed={view === "list"}
              onClick={() => changeView("list")}
            >
              <List className="h-4 w-4" />
            </Button>
            <Button
              variant={view === "grid" ? "secondary" : "ghost"}
              size="icon"
              className="h-8 w-8"
              aria-label="Grid view"
              aria-pressed={view === "grid"}
              onClick={() => changeView("grid")}
            >
              <LayoutGrid className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="bg-muted/30 h-16 animate-pulse rounded-xl border"
            />
          ))}
        </div>
      ) : projects.length === 0 ? (
        emptyState
      ) : filtered.length === 0 ? (
        <div className="bg-card/50 rounded-2xl border border-dashed p-10 text-center">
          <p className="text-muted-foreground text-sm">
            No projects match these filters.
          </p>
        </div>
      ) : view === "grid" ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {paged.rows.map((p) => (
            <ProjectCard
              key={p.id}
              project={p}
              onClick={() => router.push(saPath(`/projects/${p.id}`))}
            />
          ))}
        </div>
      ) : (
        <div className="bg-card overflow-x-auto rounded-2xl border">
          <table className="w-full min-w-[860px] text-sm">
            <thead>
              <tr className="text-muted-foreground border-b text-left text-[11px] font-semibold tracking-wider uppercase">
                <th className="px-5 py-3">Project</th>
                <th className="px-3 py-3">Type</th>
                <th className="px-3 py-3">Progress</th>
                <th className="px-3 py-3">Start date</th>
                <th className="px-3 py-3">Due date</th>
                <th className="px-3 py-3">Tasks</th>
                <th className="px-3 py-3">Assigned to</th>
                <th className="w-12 px-3 py-3">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {paged.rows.map((p, i) => {
                const pct = projectProgressPct(p);
                const href = saPath(`/projects/${p.id}`);
                return (
                  <tr
                    key={p.id}
                    onClick={() => router.push(href)}
                    className="hover:bg-muted/40 cursor-pointer border-b transition-colors last:border-b-0"
                  >
                    <td className="max-w-[320px] px-5 py-4">
                      <div className="flex gap-3">
                        <span
                          className={cn(
                            "mt-1 w-1 shrink-0 self-stretch rounded-full",
                            progressBarTone(i)
                          )}
                          aria-hidden
                        />
                        <div className="min-w-0">
                          <Link
                            href={href}
                            onClick={(e) => e.stopPropagation()}
                            className="block truncate font-semibold hover:underline"
                          >
                            {p.title}
                          </Link>
                          {p.description && (
                            <p className="text-muted-foreground line-clamp-2 text-xs">
                              {p.description}
                            </p>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-4">
                      <TypePill project={p} />
                    </td>
                    <td className="px-3 py-4">
                      <div className="flex items-center gap-2">
                        <div className="bg-muted h-2 w-24 overflow-hidden rounded-full">
                          <div
                            className={cn(
                              "h-full rounded-full",
                              progressBarTone(i)
                            )}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="w-9 text-xs tabular-nums">
                          {pct}%
                        </span>
                      </div>
                    </td>
                    <td className="text-muted-foreground px-3 py-4 whitespace-nowrap">
                      {formatDay(p.startAt)}
                    </td>
                    <td className="text-muted-foreground px-3 py-4 whitespace-nowrap">
                      {formatDay(p.dueAt)}
                    </td>
                    <td className="px-3 py-4 font-medium whitespace-nowrap tabular-nums">
                      {p.stepCount} {p.stepCount === 1 ? "task" : "tasks"}
                    </td>
                    <td className="max-w-[180px] px-3 py-4">
                      <AssigneeCell project={p} />
                    </td>
                    <td
                      className="px-3 py-4"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <ProjectRowMenu
                        project={p}
                        href={href}
                        onEdit={() => onEdit(p)}
                        onStatus={(status) =>
                          setProjectStatus(subAccountId, p, status)
                        }
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {!loading && filtered.length > 0 && (
        <Pagination
          page={paged.page}
          pageCount={paged.pageCount}
          total={filtered.length}
          pageSize={PAGE_SIZE}
          noun={filtered.length === 1 ? "project" : "projects"}
          onPage={setPage}
        />
      )}
    </section>
  );
}

function ProjectRowMenu({
  project,
  href,
  onEdit,
  onStatus,
}: {
  project: Project;
  href: string;
  onEdit: () => void;
  onStatus: (status: "active" | "archived") => void;
}) {
  const router = useRouter();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Actions for ${project.title}`}
          />
        }
      >
        <MoreHorizontal className="h-4 w-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem onClick={() => router.push(href)}>
          <ExternalLink className="mr-2 h-4 w-4" /> Open workspace
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onEdit}>
          <Pencil className="mr-2 h-4 w-4" /> Edit details
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {project.status === "active" ? (
          <DropdownMenuItem onClick={() => onStatus("archived")}>
            <Archive className="mr-2 h-4 w-4" /> Archive
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem onClick={() => onStatus("active")}>
            <ArchiveRestore className="mr-2 h-4 w-4" /> Reactivate
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function ProjectsEmptyState({
  title,
  desc,
  action,
}: {
  title: string;
  desc: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="bg-card/50 rounded-2xl border border-dashed p-10 text-center">
      <div className="bg-primary/10 mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full">
        <FolderKanban className="text-primary h-6 w-6" />
      </div>
      <h3 className="text-base font-semibold">{title}</h3>
      <p className="text-muted-foreground mt-1 text-sm">{desc}</p>
      {action && <div className="mt-6 flex justify-center">{action}</div>}
    </div>
  );
}
