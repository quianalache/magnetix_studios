"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  ArrowUpDown,
  CalendarDays,
  Crown,
  Eye,
  EyeOff,
  Flag,
  Layers,
  LayoutTemplate,
  ListChecks,
  MoreHorizontal,
  Pencil,
  Plus,
  Repeat,
  Search,
  SlidersHorizontal,
  Star,
  UserRound,
  Zap,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useMediaQuery } from "@/hooks/use-media-query";
import { useProjectsData } from "@/hooks/use-projects-data";
import { useSubAccount } from "@/context/sub-account-context";
import {
  setTemplateFavorite,
  subscribeToTemplateFavorites,
} from "@/lib/firestore/project-template-favorites";
import {
  SYSTEM_TEMPLATES,
  TEMPLATE_CATEGORY_LABELS,
  TEMPLATE_CATEGORY_ORDER,
  workspaceTemplateToLibrary,
  type LibraryTemplate,
} from "@/lib/projects/template-library";
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
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { ProjectDialog } from "@/components/projects/project-dialog";
import { TemplateDialog } from "@/components/projects/template-dialog";
import { TemplatePreviewPanel } from "@/components/projects/template-preview-panel";
import {
  CategoryBadge,
  SourceBadge,
} from "@/components/projects/template-badges";
import {
  ProjectsMetric,
  ProjectsShell,
} from "@/components/projects/projects-shell";
import type { ProjectTemplate } from "@/types/projects";

/**
 * Projects → Templates (approved mockup 03).
 *
 * The library shows the 8 recovered Momentum OS system templates (bundled,
 * read-only — see lib/projects/template-library.ts) ALONGSIDE this
 * sub-account's existing `projectTemplates` records, which are listed
 * exactly as stored and never merged, renamed or rewritten. Workspace
 * templates keep their existing create / edit / delete (TemplateDialog)
 * and generate-a-project (ProjectDialog) flows.
 *
 * Not shown: usage statistics ("Most used", use counts). Magnetix has no
 * usage storage for templates yet, so a "Sort: Most used" or "Used N×"
 * would be invented numbers.
 */

type Chip =
  | { kind: "all" }
  | { kind: "favorites" }
  | { kind: "system" }
  | { kind: "workspace" }
  | { kind: "category"; key: string };
type SortKey = "name" | "tasks" | "duration_asc" | "duration_desc";
type AudienceFilter = "all" | "internal" | "client";

const SORT_LABELS: Record<SortKey, string> = {
  name: "Name",
  tasks: "Most tasks",
  duration_asc: "Shortest duration",
  duration_desc: "Longest duration",
};

function chipEquals(a: Chip, b: Chip): boolean {
  return (
    a.kind === b.kind &&
    (a.kind !== "category" || a.key === (b as { key: string }).key)
  );
}

export default function TemplateLibraryPage() {
  const { user } = useAuth();
  const { subAccountId } = useSubAccount();
  const { templates, contacts, loading } = useProjectsData();
  const isWide = useMediaQuery("(min-width: 1280px)");

  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [chip, setChip] = useState<Chip>({ kind: "all" });
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortKey>("name");
  const [audience, setAudience] = useState<AudienceFilter>("all");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const [templateDialogOpen, setTemplateDialogOpen] = useState(false);
  const [editTemplate, setEditTemplate] = useState<ProjectTemplate | null>(
    null
  );
  const [projectDialogOpen, setProjectDialogOpen] = useState(false);
  const [generateFrom, setGenerateFrom] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    return subscribeToTemplateFavorites(
      user.uid,
      subAccountId,
      setFavorites,
      () => setFavorites(new Set())
    );
  }, [user, subAccountId]);

  const library = useMemo<LibraryTemplate[]>(
    () => [...SYSTEM_TEMPLATES, ...templates.map(workspaceTemplateToLibrary)],
    [templates]
  );

  const categoryChips = useMemo(() => {
    const counts = new Map<string, { label: string; count: number }>();
    for (const t of library) {
      if (t.categoryKey === "uncategorized") continue;
      const cur = counts.get(t.categoryKey);
      counts.set(t.categoryKey, {
        label: TEMPLATE_CATEGORY_LABELS[t.categoryKey] ?? t.categoryLabel,
        count: (cur?.count ?? 0) + 1,
      });
    }
    const rank = (k: string) => {
      const i = TEMPLATE_CATEGORY_ORDER.indexOf(k);
      return i === -1 ? TEMPLATE_CATEGORY_ORDER.length : i;
    };
    return [...counts.entries()]
      .sort(
        (a, b) => rank(a[0]) - rank(b[0]) || a[1].label.localeCompare(b[1].label)
      )
      .map(([key, v]) => ({ key, ...v }));
  }, [library]);

  const counts = useMemo(
    () => ({
      all: library.length,
      favorites: library.filter((t) => favorites.has(t.key)).length,
      system: library.filter((t) => t.source === "system").length,
      workspace: library.filter((t) => t.source === "workspace").length,
    }),
    [library, favorites]
  );

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = library.filter((t) => {
      if (chip.kind === "favorites" && !favorites.has(t.key)) return false;
      if (chip.kind === "system" && t.source !== "system") return false;
      if (chip.kind === "workspace" && t.source !== "workspace") return false;
      if (chip.kind === "category" && t.categoryKey !== chip.key) return false;
      if (audience !== "all" && t.audience !== audience) return false;
      if (!q) return true;
      return (
        t.name.toLowerCase().includes(q) ||
        t.description.toLowerCase().includes(q) ||
        t.categoryLabel.toLowerCase().includes(q) ||
        t.tags.some((tag) => tag.toLowerCase().includes(q))
      );
    });
    const dur = (t: LibraryTemplate, fallback: number) =>
      t.durationDays ?? fallback;
    list.sort((a, b) => {
      switch (sort) {
        case "tasks":
          return b.tasks.length - a.tasks.length || a.name.localeCompare(b.name);
        case "duration_asc":
          return dur(a, Infinity) - dur(b, Infinity) || a.name.localeCompare(b.name);
        case "duration_desc":
          return dur(b, -1) - dur(a, -1) || a.name.localeCompare(b.name);
        default:
          return (
            a.name.localeCompare(b.name) ||
            (a.source === "system" ? -1 : 1)
          );
      }
    });
    return list;
  }, [library, chip, favorites, audience, search, sort]);

  const selected = library.find((t) => t.key === selectedKey) ?? null;

  async function toggleFavorite(t: LibraryTemplate) {
    if (!user) return;
    const next = !favorites.has(t.key);
    // Optimistic — the snapshot listener confirms.
    setFavorites((prev) => {
      const s = new Set(prev);
      if (next) s.add(t.key);
      else s.delete(t.key);
      return s;
    });
    try {
      await setTemplateFavorite(user.uid, subAccountId, t.key, next);
    } catch {
      toast.error("Couldn't update favorites.");
    }
  }

  function openNewTemplate() {
    setEditTemplate(null);
    setTemplateDialogOpen(true);
  }
  function openEditTemplate(t: LibraryTemplate) {
    if (!t.workspaceTemplate) return;
    setEditTemplate(t.workspaceTemplate);
    setTemplateDialogOpen(true);
  }
  function openGenerate(t: LibraryTemplate) {
    if (!t.workspaceTemplate) return;
    setGenerateFrom(t.workspaceTemplate.id);
    setProjectDialogOpen(true);
  }

  const preview = selected ? (
    <TemplatePreviewPanel
      key={selected.key}
      template={selected}
      favorite={favorites.has(selected.key)}
      onToggleFavorite={() => toggleFavorite(selected)}
      onClose={() => setSelectedKey(null)}
      onEdit={() => openEditTemplate(selected)}
      onGenerate={() => openGenerate(selected)}
      className="h-full"
    />
  ) : null;

  const chipBtn = (c: Chip, label: React.ReactNode, count: number) => {
    const isActive = chipEquals(chip, c);
    return (
      <button
        key={c.kind === "category" ? `cat-${c.key}` : c.kind}
        type="button"
        aria-pressed={isActive}
        onClick={() =>
          // Clicking the active category chip returns to All (original behavior).
          setChip(isActive && c.kind === "category" ? { kind: "all" } : c)
        }
        className={cn(
          "flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm transition-colors",
          isActive
            ? "border-primary bg-primary text-primary-foreground"
            : "bg-card hover:bg-muted"
        )}
      >
        {label}
        <span className={cn("tabular-nums", !isActive && "text-muted-foreground")}>
          ({count})
        </span>
      </button>
    );
  };

  return (
    <ProjectsShell
      active="templates"
      wide
      actions={
        <Button className="h-11 px-5" onClick={openNewTemplate}>
          <Plus className="mr-1.5 h-4 w-4" />
          New Template
        </Button>
      }
    >
      <div className="flex gap-6">
        <div className="min-w-0 flex-1 space-y-5">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <ProjectsMetric
              icon={<LayoutTemplate className="h-5 w-5" />}
              tone="bg-violet-500/10 text-violet-600 dark:text-violet-300"
              value={loading ? "–" : counts.all}
              label="Total templates"
            />
            <ProjectsMetric
              icon={<Star className="h-5 w-5" />}
              tone="bg-pink-500/10 text-pink-600 dark:text-pink-300"
              value={counts.favorites}
              label="Favorite templates"
            />
            <ProjectsMetric
              icon={<Layers className="h-5 w-5" />}
              tone="bg-teal-500/10 text-teal-600 dark:text-teal-300"
              value={counts.system}
              label="System templates"
            />
            <ProjectsMetric
              icon={<UserRound className="h-5 w-5" />}
              tone="bg-violet-500/10 text-violet-600 dark:text-violet-300"
              value={loading ? "–" : counts.workspace}
              label="Workspace templates"
            />
          </div>

          <div className="flex flex-col gap-2 md:flex-row md:items-center">
            <div className="relative flex-1">
              <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search templates…"
                aria-label="Search templates"
                className="h-10 pl-9"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={<Button variant="outline" className="h-10" />}
                >
                  <SlidersHorizontal className="mr-1.5 h-4 w-4" />
                  Filter
                  {audience !== "all" && (
                    <span className="bg-primary text-primary-foreground ml-1.5 rounded-full px-1.5 text-[11px]">
                      1
                    </span>
                  )}
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-60">
                  <p className="text-muted-foreground px-2 pt-1.5 pb-1 text-xs font-medium">
                    Workspace template audience
                  </p>
                  {(
                    [
                      ["all", "Any audience"],
                      ["internal", "My business (internal)"],
                      ["client", "Clients"],
                    ] as [AudienceFilter, string][]
                  ).map(([v, label]) => (
                    <DropdownMenuItem key={v} onClick={() => setAudience(v)}>
                      <span className={cn(audience === v && "font-semibold")}>
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
                  aria-label="Sort templates"
                  className="[&_option]:bg-background [&_option]:text-foreground bg-transparent font-medium outline-none"
                >
                  {(Object.keys(SORT_LABELS) as SortKey[]).map((k) => (
                    <option key={k} value={k}>
                      {SORT_LABELS[k]}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          <div className="flex flex-wrap gap-2" aria-label="Template categories">
            {chipBtn({ kind: "all" }, "All", counts.all)}
            {chipBtn(
              { kind: "favorites" },
              <>
                <Star className="h-3.5 w-3.5" /> Favorites
              </>,
              counts.favorites
            )}
            {chipBtn(
              { kind: "system" },
              <>
                <Crown className="h-3.5 w-3.5" /> System
              </>,
              counts.system
            )}
            {chipBtn({ kind: "workspace" }, "Workspace", counts.workspace)}
            {categoryChips.map((c) =>
              chipBtn({ kind: "category", key: c.key }, c.label, c.count)
            )}
          </div>

          {shown.length === 0 ? (
            <div className="bg-card/50 rounded-2xl border border-dashed p-10 text-center">
              <LayoutTemplate className="text-muted-foreground mx-auto h-8 w-8" />
              <h3 className="mt-3 text-base font-semibold">
                No templates here yet
              </h3>
              <p className="text-muted-foreground mt-1 text-sm">
                {chip.kind === "favorites"
                  ? "Star a template to keep it close."
                  : "Try another filter, or build a reusable template."}
              </p>
            </div>
          ) : (
            <div
              className={cn(
                "grid gap-4 sm:grid-cols-2",
                selected && isWide ? "2xl:grid-cols-3" : "xl:grid-cols-3"
              )}
            >
              {shown.map((t) => (
                <TemplateCard
                  key={t.key}
                  template={t}
                  selected={t.key === selectedKey}
                  favorite={favorites.has(t.key)}
                  onToggleFavorite={() => toggleFavorite(t)}
                  onPreview={() =>
                    setSelectedKey((k) => (k === t.key ? null : t.key))
                  }
                  onGenerate={() => openGenerate(t)}
                  onEdit={() => openEditTemplate(t)}
                />
              ))}
            </div>
          )}
        </div>

        {selected && isWide && (
          <div className="sticky top-4 h-[calc(100vh-7rem)] w-[400px] shrink-0 overflow-hidden rounded-2xl border shadow-sm">
            {preview}
          </div>
        )}
      </div>

      <Sheet
        open={!!selected && !isWide}
        onOpenChange={(open) => !open && setSelectedKey(null)}
      >
        <SheetContent className="w-full p-0 sm:max-w-md" showCloseButton={false}>
          <SheetTitle className="sr-only">Template preview</SheetTitle>
          {preview}
        </SheetContent>
      </Sheet>

      <TemplateDialog
        open={templateDialogOpen}
        onOpenChange={setTemplateDialogOpen}
        template={editTemplate}
      />
      <ProjectDialog
        open={projectDialogOpen}
        onOpenChange={setProjectDialogOpen}
        contacts={contacts}
        templates={templates}
        project={null}
        initialTemplateId={generateFrom}
      />
    </ProjectsShell>
  );
}

function TemplateCard({
  template: t,
  selected,
  favorite,
  onToggleFavorite,
  onPreview,
  onGenerate,
  onEdit,
}: {
  template: LibraryTemplate;
  selected: boolean;
  favorite: boolean;
  onToggleFavorite: () => void;
  onPreview: () => void;
  onGenerate: () => void;
  onEdit: () => void;
}) {
  const isSystem = t.source === "system";
  return (
    <article
      className={cn(
        "bg-card flex flex-col rounded-2xl border p-4 shadow-xs transition-colors",
        selected
          ? "border-primary ring-primary/30 ring-2"
          : "hover:border-primary/40"
      )}
    >
      <div className="flex items-start gap-2">
        <div className="flex min-w-0 flex-1 flex-wrap gap-1.5">
          <CategoryBadge template={t} />
          <SourceBadge template={t} />
        </div>
        <button
          type="button"
          onClick={onToggleFavorite}
          aria-pressed={favorite}
          aria-label={
            favorite
              ? `Remove ${t.name} from favorites`
              : `Add ${t.name} to favorites`
          }
          className="hover:bg-muted -mt-1 -mr-1 rounded-md p-1"
        >
          <Star
            className={cn(
              "h-4 w-4",
              favorite
                ? "fill-amber-400 text-amber-400"
                : "text-muted-foreground"
            )}
          />
        </button>
        {!isSystem && (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <button
                  type="button"
                  aria-label={`Actions for ${t.name}`}
                  className="hover:bg-muted -mt-1 -mr-1 rounded-md p-1"
                />
              }
            >
              <MoreHorizontal className="text-muted-foreground h-4 w-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem onClick={onPreview}>
                <Eye className="mr-2 h-4 w-4" /> Preview
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onEdit}>
                <Pencil className="mr-2 h-4 w-4" /> Edit template
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      <h3 className="mt-2 text-base leading-snug font-semibold">{t.name}</h3>
      {t.description ? (
        <p className="text-muted-foreground mt-1 line-clamp-3 text-sm">
          {t.description}
        </p>
      ) : (
        <p className="text-muted-foreground/70 mt-1 text-sm italic">
          No description
        </p>
      )}

      <div className="text-muted-foreground mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs">
        <span className="flex items-center gap-1">
          <ListChecks className="h-3.5 w-3.5" />
          {t.tasks.length} {t.tasks.length === 1 ? "task" : "tasks"}
        </span>
        {t.milestones.length > 0 && (
          <span className="flex items-center gap-1">
            <Flag className="h-3.5 w-3.5" />
            {t.milestones.length}{" "}
            {t.milestones.length === 1 ? "milestone" : "milestones"}
          </span>
        )}
        {t.routines.length > 0 && (
          <span className="flex items-center gap-1">
            <Repeat className="h-3.5 w-3.5" />
            {t.routines.length} {t.routines.length === 1 ? "routine" : "routines"}
          </span>
        )}
        {t.durationDays ? (
          <span className="flex items-center gap-1">
            <CalendarDays className="h-3.5 w-3.5" />
            {t.durationDays} days
          </span>
        ) : null}
      </div>

      <div className="mt-auto flex gap-2 pt-4">
        <Button
          variant="outline"
          className="flex-1"
          onClick={onPreview}
          aria-pressed={selected}
        >
          {selected ? (
            <EyeOff className="mr-1.5 h-4 w-4" />
          ) : (
            <Eye className="mr-1.5 h-4 w-4" />
          )}
          {selected ? "Close" : "Preview"}
        </Button>
        {!isSystem && (
          <Button className="flex-1" onClick={onGenerate}>
            <Zap className="mr-1.5 h-4 w-4" />
            Generate Project
          </Button>
        )}
      </div>
    </article>
  );
}
