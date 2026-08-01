"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Download, Upload, Plus, MoreVertical, Pencil, Trash2, Lightbulb, Clock, ListChecks, Tag, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CONTENT_TYPES, type ContentTemplateDoc } from "@/types/content-library";

const TYPE_LABEL: Record<string, string> = Object.fromEntries(
  CONTENT_TYPES.map((t) => [t.value, t.label]),
);

const CATEGORY_EMOJI: Record<string, string> = {
  newsletter: "📧",
  youtube: "▶️",
  social: "📱",
  podcast: "🎙️",
  launch: "🚀",
};

const CATEGORY_BG = ["bg-secondary/60", "bg-primary/10", "bg-accent/20", "bg-secondary/35", "bg-primary/20"];

function categoryEmoji(category: string): string {
  return CATEGORY_EMOJI[category] ?? "🗂️";
}

function categoryLabel(category: string): string {
  return category ? category.charAt(0).toUpperCase() + category.slice(1) : "Uncategorized";
}

export function TemplatesTab({
  templates,
  isAdmin,
  onUse,
  onEdit,
  onDelete,
  onNew,
}: {
  templates: ContentTemplateDoc[];
  isAdmin: boolean;
  onUse: (tpl: ContentTemplateDoc) => void;
  onEdit: (tpl: ContentTemplateDoc) => void;
  onDelete: (tpl: ContentTemplateDoc) => void;
  onNew: () => void;
}) {
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);

  const categories = useMemo(() => {
    const map = new Map<string, ContentTemplateDoc[]>();
    for (const t of templates) {
      const list = map.get(t.category) ?? [];
      list.push(t);
      map.set(t.category, list);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [templates]);

  const visibleCategories = categoryFilter
    ? categories.filter(([cat]) => cat === categoryFilter)
    : categories;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold tracking-tight">Content Templates</h2>
          <p className="text-sm text-muted-foreground">Reusable structures for your recurring content types.</p>
        </div>
        {isAdmin && (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" className="rounded-full" onClick={() => toast("Export is coming soon.")}>
              <Download className="mr-1 h-3.5 w-3.5" />
              Export All
            </Button>
            <Button variant="outline" size="sm" className="rounded-full" onClick={() => toast("Import is coming soon.")}>
              <Upload className="mr-1 h-3.5 w-3.5" />
              Import
            </Button>
            <Button size="sm" className="rounded-full" onClick={onNew}>
              <Plus className="mr-1 h-3.5 w-3.5" />
              New Template
            </Button>
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setCategoryFilter(null)}
          className={`rounded-full px-3 py-1.5 text-xs font-semibold ${!categoryFilter ? "bg-primary text-primary-foreground" : "bg-card text-foreground"}`}
        >
          All ({templates.length})
        </button>
        {categories.map(([cat, list]) => (
          <button
            key={cat}
            type="button"
            onClick={() => setCategoryFilter(cat)}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold ${categoryFilter === cat ? "bg-primary text-primary-foreground" : "bg-card text-foreground"}`}
          >
            {categoryEmoji(cat)} {categoryLabel(cat)} ({list.length})
          </button>
        ))}
      </div>

      {templates.length === 0 ? (
        <div className="rounded-2xl border border-dashed p-14 text-center">
          <Sparkles className="mx-auto mb-3 h-6 w-6 text-muted-foreground" />
          <h3 className="text-base font-semibold">No templates yet</h3>
        </div>
      ) : (
        visibleCategories.map(([cat, list], catIdx) => (
          <div key={cat} className="space-y-3">
            <h3 className="flex items-center gap-2 text-sm font-bold">
              {categoryEmoji(cat)} {categoryLabel(cat)}
              <span className="font-normal text-muted-foreground">({list.length})</span>
            </h3>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {list.map((tpl) => (
                <TemplateCard
                  key={tpl.id}
                  tpl={tpl}
                  bg={CATEGORY_BG[catIdx % CATEGORY_BG.length]}
                  isAdmin={isAdmin}
                  onUse={() => onUse(tpl)}
                  onEdit={() => onEdit(tpl)}
                  onDelete={() => onDelete(tpl)}
                />
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

function TemplateCard({
  tpl,
  bg,
  isAdmin,
  onUse,
  onEdit,
  onDelete,
}: {
  tpl: ContentTemplateDoc;
  bg: string;
  isAdmin: boolean;
  onUse: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const previewSteps = tpl.checklist.slice(0, 3);
  const moreSteps = tpl.checklist.length - previewSteps.length;

  return (
    <div className={`flex flex-col rounded-xl border p-4 ${bg}`}>
      {tpl.isEvergreen && (
        <span className="mb-2 inline-flex w-fit items-center rounded-full bg-card px-2 py-0.5 text-[10.5px] font-medium text-foreground/80">
          Evergreen
        </span>
      )}
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-bold">{tpl.name}</p>
        {isAdmin && !tpl.isSystem && (
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button variant="ghost" size="sm" className="h-6 w-6 shrink-0 p-0" aria-label="Template actions">
                  <MoreVertical className="h-3.5 w-3.5" />
                </Button>
              }
            />
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onEdit}>
                <Pencil className="mr-2 h-3.5 w-3.5" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onDelete} className="text-destructive focus:text-destructive">
                <Trash2 className="mr-2 h-3.5 w-3.5" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      <p className="mt-1 text-xs text-foreground/70">{tpl.description}</p>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <span className="rounded-full bg-card px-2 py-0.5 text-[10.5px] font-medium">
          {TYPE_LABEL[tpl.contentType] ?? tpl.contentType}
        </span>
        <span className="rounded-full bg-card px-2 py-0.5 text-[10.5px] font-medium">{tpl.platform}</span>
      </div>

      {tpl.hookFormula && (
        <p className="mt-2 flex items-start gap-1.5 text-[11px] italic text-foreground/70">
          <Lightbulb className="mt-0.5 h-3 w-3 shrink-0" />
          <span className="line-clamp-1">&quot;{tpl.hookFormula}&quot;</span>
        </p>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-3 text-[10.5px] text-foreground/70">
        {tpl.estimatedMinutes != null && (
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {(tpl.estimatedMinutes / 60).toFixed(1)}h
          </span>
        )}
        {tpl.checklist.length > 0 && (
          <span className="inline-flex items-center gap-1">
            <ListChecks className="h-3 w-3" />
            {tpl.checklist.length} steps
          </span>
        )}
        {tpl.defaultTags.length > 0 && (
          <span className="inline-flex items-center gap-1 truncate">
            <Tag className="h-3 w-3 shrink-0" />
            {tpl.defaultTags.slice(0, 2).join(", ")}
            {tpl.defaultTags.length > 2 ? ` +${tpl.defaultTags.length - 2}` : ""}
          </span>
        )}
      </div>

      {previewSteps.length > 0 && (
        <div className="mt-3 rounded-lg bg-card/70 p-2.5">
          <p className="mb-1.5 text-[10.5px] font-semibold text-foreground/80">Production Checklist</p>
          <ol className="space-y-1">
            {previewSteps.map((step, i) => (
              <li key={i} className="flex gap-1.5 text-[11px] text-foreground/70">
                <span className="text-foreground/40">{i + 1}</span>
                {step}
              </li>
            ))}
          </ol>
          {moreSteps > 0 && (
            <p className="mt-1 text-[10.5px] text-foreground/50">+{moreSteps} more steps</p>
          )}
        </div>
      )}

      {isAdmin && (
        <Button className="mt-3 w-full rounded-full" onClick={onUse}>
          Use Template →
        </Button>
      )}
    </div>
  );
}
