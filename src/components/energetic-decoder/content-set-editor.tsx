"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Check, ChevronRight, Info, Loader2, Lock, RotateCcw, Search, Undo2 } from "lucide-react";
import { useSubAccount } from "@/context/sub-account-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  CONTENT_CATEGORIES,
  CONTENT_SYSTEMS,
  CONTENT_TERM_MAX,
  categorySchema,
  systemProgress,
  type ContentCatalogEntry,
  type ContentCategorySchema,
  type ContentEntryState,
  type ContentEntryValues,
  type ContentSetStatus,
  type ContentSystem,
} from "@/lib/energetic-decoder/content-sets";
import {
  Breadcrumb,
  CATEGORY_ICON,
  CS_SCOPE,
  EntryStatePill,
  IconTile,
  PageHeader,
  ProgressRing,
  StatusPill,
  SYSTEM_ICON,
  SYSTEM_TONE,
  displayTitle,
  entryTile,
  setTile,
} from "@/components/energetic-decoder/content-sets-visuals";

/**
 * Content Set editor (2026-10-07). Visuals follow the owner-approved
 * mockup (03): breadcrumb + serif title with per-system progress cards,
 * then three white panels — system tabs + search + categories → entries
 * with their state → the entry's fixed fields. Below `lg`: the same three
 * steps one at a time, each a normal page-flow screen (no nested
 * fixed-height scroll panes), with a sticky Save bar on the entry step.
 * Selection lives in the URL (`system` / `category` / `entry`) so Back works
 * and a link reopens the same entry.
 */

interface SetDetail {
  id: string;
  name: string;
  description: string;
  status: ContentSetStatus;
  isDefault: boolean;
  usageCount: number;
  catalog: ContentCatalogEntry[];
  values: Record<string, ContentEntryValues>;
  defaults: Record<string, ContentEntryValues>;
  states: Record<string, ContentEntryState>;
}

export interface EditorSelection {
  system: ContentSystem | null;
  category: string | null;
  entry: string | null;
}

const PANEL = "rounded-2xl border bg-card p-4 shadow-[0_1px_2px_rgba(26,18,56,0.04)] sm:p-5";

export function ContentSetEditor({
  setId,
  selection,
  onSelect,
  onBack,
  onHome,
}: {
  setId: string;
  selection: EditorSelection;
  onSelect: (next: EditorSelection, opts?: { push?: boolean }) => void;
  onBack: () => void;
  onHome?: () => void;
}) {
  const { subAccountId, isAdmin } = useSubAccount();
  const base = `/api/sub-accounts/${subAccountId}/energetic-decoder/content-sets/${setId}`;
  const [detail, setDetail] = useState<SetDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [placementBody, setPlacementBody] = useState("all");
  const [placementValue, setPlacementValue] = useState("all");
  const [draft, setDraft] = useState<ContentEntryValues | null>(null);
  const [saving, setSaving] = useState(false);
  const [showReference, setShowReference] = useState(false);
  const [pending, setPending] = useState<EditorSelection | "back" | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(base);
      const body = (await res.json().catch(() => ({}))) as { set?: SetDetail; error?: string };
      if (!res.ok || !body.set) throw new Error(body.error ?? "Couldn’t load this content set.");
      setDetail(body.set);
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Couldn’t load this content set.");
    }
  }, [base]);
  useEffect(() => {
    void load();
  }, [load]);

  // Below `lg` each step replaces the screen: once a category/entry step
  // has rendered (data loaded), bring its panel to the top.
  const stepKey = `${selection.category ?? ""}|${selection.entry ?? ""}`;
  const loaded = !!detail;
  useEffect(() => {
    if (!loaded || (!selection.category && !selection.entry)) return;
    if (window.matchMedia("(max-width: 1023px)").matches) {
      document.querySelector("[data-editor-panes]")?.scrollIntoView({ block: "start" });
    }
  }, [stepKey, loaded]); // eslint-disable-line react-hooks/exhaustive-deps

  // Resolve the selection against the catalog (desktop always shows the first category).
  const system: ContentSystem = selection.system ?? "hd";
  const categories = CONTENT_CATEGORIES.filter((c) => c.system === system && (detail?.catalog.some((e) => e.category === c.category && e.system === c.system) ?? true));
  const category: ContentCategorySchema | undefined =
    categorySchema(`${system}:${selection.category ?? ""}`) ?? (selection.category ? undefined : categories[0]);
  const entries = useMemo(
    () => (detail && category ? detail.catalog.filter((e) => e.system === category.system && e.category === category.category) : []),
    [detail, category],
  );
  const entry = detail?.catalog.find((e) => e.id === selection.entry) ?? null;
  const entrySchema = entry ? categorySchema(`${entry.system}:${entry.category}`) : undefined;
  const saved = entry ? detail?.values[entry.id] : undefined;

  useEffect(() => {
    setDraft(entry ? { label: saved?.label ?? "", fields: { ...(saved?.fields ?? {}) } } : null);
  }, [entry?.id, detail]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setPlacementBody("all");
    setPlacementValue("all");
  }, [category?.id]);

  const dirty = !!entry && !!draft && entrySchema
    ? (draft.label ?? "").trim() !== (saved?.label ?? "").trim() || entrySchema.fields.some((f) => (draft.fields[f.key] ?? "").trim() !== (saved?.fields?.[f.key] ?? "").trim())
    : false;
  const overLimit = !!entrySchema && !!draft && (entrySchema.fields.some((f) => (draft.fields[f.key] ?? "").trim().length > f.max) || (draft.label ?? "").trim().length > CONTENT_TERM_MAX);
  const missingRequired = !!detail?.isDefault && !!entrySchema && !!draft && entrySchema.fields.some((f) => !(draft.fields[f.key] ?? "").trim());
  const canEdit = isAdmin;

  function navigate(next: EditorSelection | "back") {
    if (dirty) {
      setPending(next);
      return;
    }
    if (next === "back") onBack();
    else onSelect(next);
  }

  async function save() {
    if (!entry || !draft || !dirty || overLimit || missingRequired) return;
    setSaving(true);
    try {
      const res = await fetch(`${base}/entries/${encodeURIComponent(entry.id)}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(detail?.isDefault ? { fields: draft.fields } : { label: draft.label, fields: draft.fields }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? "Couldn’t save.");
      toast.success(`${draft.label?.trim() || entry.canonicalLabel} saved.`);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn’t save.");
    } finally {
      setSaving(false);
    }
  }

  async function reset() {
    if (!entry) return;
    setSaving(true);
    try {
      const res = await fetch(`${base}/entries/${encodeURIComponent(entry.id)}`, { method: "DELETE" });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? "Couldn’t reset.");
      toast.success(detail?.isDefault ? `${entry.canonicalLabel} reset to the Magnetix default.` : `${entry.canonicalLabel} cleared.`);
      setConfirmReset(false);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn’t reset.");
    } finally {
      setSaving(false);
    }
  }

  if (loadError) {
    return (
      <div className={cn(CS_SCOPE, "space-y-3 rounded-2xl border bg-card p-6 text-sm text-[var(--cs-body)]")}>
        <p>{loadError}</p>
        <Button variant="outline" className="rounded-xl" onClick={onBack}>
          <ArrowLeft className="mr-1.5 h-4 w-4" />
          Back to Content Sets
        </Button>
      </div>
    );
  }
  if (!detail) return <div className={cn(CS_SCOPE, "h-96 animate-pulse rounded-2xl bg-[var(--cs-head)]")} />;

  const q = query.trim().toLowerCase();
  const isPlanetSign = category?.id === "astro:planetSign";
  const isPlanetHouse = category?.id === "astro:planetHouse";
  const isPlacement = isPlanetSign || isPlanetHouse;
  const bodyOptions = isPlacement
    ? [...new Set(entries.map((e) => e.key.split(":")[0]))]
    : [];
  const placementOptions = isPlacement
    ? [...new Set(entries.map((e) => e.key.split(":")[1]))]
    : [];
  const bodyLabels: Record<string, string> = {
    sun: "Sun", moon: "Moon", mercury: "Mercury", venus: "Venus", mars: "Mars",
    jupiter: "Jupiter", saturn: "Saturn", uranus: "Uranus", neptune: "Neptune", pluto: "Pluto",
    northNode: "North Node", southNode: "South Node", lilith: "Lilith", chiron: "Chiron",
  };
  const shownEntries = entries.filter((e) => {
    const v = detail.values[e.id];
    const matchesQuery = e.canonicalLabel.toLowerCase().includes(q) || (v?.label ?? "").toLowerCase().includes(q) || Object.values(v?.fields ?? {}).some((t) => t.toLowerCase().includes(q));
    const [body, value] = e.key.split(":");
    return (!q || matchesQuery) && (!isPlacement || (placementBody === "all" || body === placementBody) && (placementValue === "all" || value === placementValue));
  });

  // Step shown below `lg`: the deepest thing selected.
  const step: "nav" | "entries" | "entry" = entry ? "entry" : selection.category ? "entries" : "nav";

  const statesFor = (sys: ContentSystem, cat?: string) => detail.catalog.filter((e) => e.system === sys && (!cat || e.category === cat)).map((e) => detail.states[e.id]);
  const tile = setTile(detail);

  const searchBox = (
    <div className="relative">
      <Search className="pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-[var(--cs-subtle)]" />
      <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search entries..." className="h-11 rounded-xl bg-card pl-11 text-[15px]" aria-label="Search entries" />
    </div>
  );

  const nav = (
    <nav aria-label="Systems and categories" className={cn(PANEL, "space-y-4")} data-editor-step="nav">
      <div className="grid grid-cols-[1.35fr_1fr_1fr] gap-1 rounded-xl bg-[var(--cs-head)] p-1" role="tablist" aria-label="System">
        {CONTENT_SYSTEMS.map((s) => (
          <button
            key={s.key}
            type="button"
            role="tab"
            aria-selected={system === s.key}
            onClick={() => navigate({ system: s.key, category: null, entry: null })}
            className={cn(
              "min-w-0 rounded-lg px-0.5 py-2.5 text-[12.5px] font-semibold leading-tight transition xl:whitespace-nowrap",
              system === s.key ? "bg-primary text-primary-foreground shadow-sm" : "text-[var(--cs-link)] hover:bg-card",
            )}
          >
            {s.label}
          </button>
        ))}
      </div>
      <div className="hidden lg:block">{searchBox}</div>
      <ul className="space-y-1">
        {categories.map((c) => {
          const Icon = CATEGORY_ICON[c.id] ?? ChevronRight;
          const active = category?.id === c.id;
          return (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => navigate({ system: c.system, category: c.category, entry: null })}
                aria-current={active ? "true" : undefined}
                className={cn(
                  "flex min-h-12 w-full items-center gap-3.5 rounded-xl px-3 py-2.5 text-left text-[16px] text-[var(--cs-ink)] transition hover:bg-[var(--cs-tint)]",
                  active && "bg-[var(--cs-tint)] font-medium",
                )}
              >
                <Icon className="h-5 w-5 shrink-0 text-[var(--cs-violet-fg)]" strokeWidth={1.75} />
                <span className="min-w-0 flex-1">{c.label}</span>
                <ChevronRight className="h-4 w-4 shrink-0 text-[var(--cs-subtle)]" />
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );

  const entryList = category && (
    <div className={cn(PANEL, "min-w-0 space-y-3")} data-editor-step="entries">
      <div className="lg:hidden">
        <Button variant="ghost" size="sm" className="-ml-2 text-[var(--cs-link)]" onClick={() => navigate({ system, category: null, entry: null })}>
          <ArrowLeft className="mr-1 h-4 w-4" />
          Categories
        </Button>
      </div>
      <div className="flex items-baseline justify-between gap-3 px-1">
        <p className="text-[18px] font-semibold text-[var(--cs-ink)]">{category.label}</p>
        <div className="shrink-0 text-right text-[14px] text-[var(--cs-subtle)]">
          <p>{shownEntries.length === entries.length ? entries.length : `${shownEntries.length} of ${entries.length}`} {entries.length === 1 ? "entry" : "entries"}</p>
          <p className="text-[12px]">{systemProgress(entries.map((e) => detail.states[e.id])).done} complete/customized</p>
        </div>
      </div>
      <div className="lg:hidden">{searchBox}</div>
      {isPlacement && (
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="min-w-0">
            <span className="sr-only">Body or point</span>
            <select
              value={placementBody}
              onChange={(e) => setPlacementBody(e.target.value)}
              aria-label="Filter by body or point"
              className="h-11 w-full min-w-0 rounded-xl border bg-card px-3 text-[14px] text-[var(--cs-ink)]"
            >
              <option value="all">All bodies / points</option>
              {bodyOptions.map((body) => <option key={body} value={body}>{bodyLabels[body] ?? body}</option>)}
            </select>
          </label>
          <label className="min-w-0">
            <span className="sr-only">{isPlanetSign ? "Zodiac sign" : "House"}</span>
            <select
              value={placementValue}
              onChange={(e) => setPlacementValue(e.target.value)}
              aria-label={isPlanetSign ? "Filter by zodiac sign" : "Filter by house"}
              className="h-11 w-full min-w-0 rounded-xl border bg-card px-3 text-[14px] text-[var(--cs-ink)]"
            >
              <option value="all">{isPlanetSign ? "All signs" : "All houses"}</option>
              {placementOptions.map((value) => <option key={value} value={value}>{isPlanetSign ? value : `House ${value}`}</option>)}
            </select>
          </label>
        </div>
      )}
      <ul className="divide-y divide-[var(--border)]">
        {shownEntries.map((e) => {
          const v = detail.values[e.id];
          const term = v?.label?.trim();
          const t = entryTile(category.id, e.key);
          const selected = entry?.id === e.id;
          return (
            <li key={e.id} className="py-1 first:pt-0 last:pb-0">
              <button
                type="button"
                onClick={() => navigate({ system: e.system, category: e.category, entry: e.id })}
                aria-current={selected ? "true" : undefined}
                className={cn("flex min-h-16 w-full items-center gap-3.5 rounded-xl px-2.5 py-2.5 text-left transition hover:bg-[var(--cs-tint)]", selected && "bg-[var(--cs-tint)]")}
              >
                <IconTile icon={t.icon} tone={t.tone} shape="circle" size="md" className={t.className} />
                <span className="min-w-0 flex-1 space-y-1.5">
                  <span className="block break-words text-[16px] font-medium leading-snug text-[var(--cs-ink)]">{term || e.canonicalLabel}</span>
                  {term && <span className="-mt-1 block truncate text-[12px] text-[var(--cs-subtle)]">{e.canonicalLabel}</span>}
                  <EntryStatePill state={detail.states[e.id]} />
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-[var(--cs-subtle)]" />
              </button>
            </li>
          );
        })}
        {shownEntries.length === 0 && <li className="px-3 py-8 text-center text-sm text-[var(--cs-subtle)]">No matches.</li>}
      </ul>
    </div>
  );

  const ref = entry ? detail.defaults[entry.id] : undefined;
  const fieldClass = "rounded-xl bg-card text-[15px] text-[var(--cs-ink)]";
  const form =
    entry && entrySchema && draft ? (
      <div className={cn(PANEL, "min-w-0 space-y-5 pb-0 sm:pb-0")} data-editor-step="entry" data-entry-form>
        <div className="lg:hidden">
          <Button variant="ghost" size="sm" className="-ml-2 text-[var(--cs-link)]" onClick={() => navigate({ system: entry.system, category: entry.category, entry: null })}>
            <ArrowLeft className="mr-1 h-4 w-4" />
            {entrySchema.label}
          </Button>
        </div>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-4">
            {(() => {
              const t = entryTile(entrySchema.id, entry.key);
              return <IconTile icon={t.icon} tone={t.tone} shape="circle" size="lg" className={cn("max-sm:h-12 max-sm:w-12", t.className)} />;
            })()}
            <div className="min-w-0">
              <p className={cn(displayTitle, "break-words text-[28px] leading-tight sm:text-[32px]")}>{draft.label?.trim() || entry.canonicalLabel}</p>
              <p className="mt-1 flex flex-wrap items-center gap-1.5 text-[14px] text-[var(--cs-subtle)]">
                {entrySchema.label}
                <ChevronRight className="h-3.5 w-3.5" />
                {entry.canonicalLabel}
              </p>
            </div>
          </div>
          <EntryStatePill state={detail.states[entry.id]} size="md" />
        </div>

        <div className="flex items-start gap-3 rounded-xl bg-[var(--cs-tint)] px-4 py-3.5 text-[14px] leading-relaxed text-[var(--cs-link)]" role="note">
          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[var(--cs-link)] text-[var(--card)]">
            <Info className="h-3.5 w-3.5" strokeWidth={2.5} />
          </span>
          {detail.isDefault ? (
            <p>You&apos;re editing the built-in Default, including your edits. Every field is required here, and Reset returns this entry to the Magnetix wording.</p>
          ) : (
            <p>You&apos;re customizing this content set. Missing content will remain blank in generated reports unless you add your own interpretation.</p>
          )}
        </div>

        {!detail.isDefault && (
          <label className="flex cursor-pointer items-start gap-3.5 border-b pb-4">
            <Switch checked={showReference} onCheckedChange={(v: boolean) => setShowReference(v)} aria-label="Use Magnetix default content as reference" className="mt-0.5 shrink-0" />
            <span>
              <span className="block text-[15px] font-medium text-[var(--cs-ink)]">Use Magnetix default content as reference</span>
              <span className="block text-[13px] text-[var(--cs-subtle)]">View the default content while editing (won&apos;t replace your custom text).</span>
            </span>
          </label>
        )}

        <div className="space-y-1.5">
          <Label className="flex items-center gap-1.5 text-[14px] font-medium text-[var(--cs-ink)]">
            Default Magnetix label
            <Info className="h-3.5 w-3.5 text-[var(--cs-subtle)]" aria-label="The calculated value. It never changes." />
          </Label>
          <div className="flex h-11 items-center rounded-xl bg-[var(--muted)] px-3.5 text-[15px] text-[var(--cs-body)]" data-canonical-label>
            {entry.canonicalLabel}
          </div>
        </div>

        {!detail.isDefault && entrySchema.allowCustomLabel !== false && (
          <div className="space-y-1.5">
            <Label htmlFor="cs-term" className="flex items-center gap-1.5 text-[14px] font-medium text-[var(--cs-ink)]">
              Custom term (optional)
              <Info className="h-3.5 w-3.5 text-[var(--cs-subtle)]" aria-label={`Shown in reports instead of “${entry.canonicalLabel}”. The calculated value itself never changes.`} />
            </Label>
            <Input
              id="cs-term"
              value={draft.label ?? ""}
              onChange={(e) => setDraft((d) => (d ? { ...d, label: e.target.value } : d))}
              placeholder={`e.g. a term your clients use instead of “${entry.canonicalLabel}”`}
              readOnly={!canEdit}
              aria-invalid={(draft.label ?? "").trim().length > CONTENT_TERM_MAX}
              className={cn(fieldClass, "h-11")}
            />
          </div>
        )}

        {entrySchema.fields.map((f) => {
          const value = draft.fields[f.key] ?? "";
          const len = value.trim().length;
          const over = len > f.max;
          const blank = len === 0;
          return (
            <div key={f.key} className="space-y-1.5">
              <Label htmlFor={`cs-f-${f.key}`} className="flex items-center gap-1.5 text-[14px] font-medium text-[var(--cs-ink)]">
                {f.label}
                <Info className="h-3.5 w-3.5 text-[var(--cs-subtle)]" aria-label={f.hint ?? `Up to ${f.max} characters.`} />
              </Label>
              {f.long ? (
                <Textarea
                  id={`cs-f-${f.key}`}
                  rows={4}
                  value={value}
                  readOnly={!canEdit}
                  aria-invalid={over}
                  onChange={(e) => setDraft((d) => (d ? { ...d, fields: { ...d.fields, [f.key]: e.target.value } } : d))}
                  className={cn(fieldClass, "px-3.5 py-3 leading-relaxed")}
                />
              ) : (
                <Input
                  id={`cs-f-${f.key}`}
                  value={value}
                  readOnly={!canEdit}
                  aria-invalid={over}
                  onChange={(e) => setDraft((d) => (d ? { ...d, fields: { ...d.fields, [f.key]: e.target.value } } : d))}
                  className={cn(fieldClass, "h-11")}
                />
              )}
              <div className="flex items-start justify-between gap-3">
                <span className="text-[13px]">
                  {f.hint && <span className="text-[var(--cs-subtle)]">{f.hint}</span>}
                  {blank && !detail.isDefault && <span className="text-[var(--cs-needs-fg)]">Blank — reports using this set will leave this empty.</span>}
                  {blank && detail.isDefault && <span className="text-destructive">Required in the Default set.</span>}
                </span>
                <span className={cn("shrink-0 whitespace-nowrap text-[13px] tabular-nums", over ? "font-semibold text-destructive" : "text-[var(--cs-subtle)]")}>
                  {len}/{f.max}
                </span>
              </div>
              {showReference && !detail.isDefault && (
                <div className="rounded-xl border border-dashed bg-[var(--cs-head)] px-3.5 py-3 text-[14px] text-[var(--cs-body)]" data-default-reference>
                  <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-[var(--cs-subtle)]">Magnetix default</span>
                  <span className="whitespace-pre-wrap">{ref?.fields?.[f.key] || "—"}</span>
                </div>
              )}
            </div>
          );
        })}

        {canEdit ? (
          <div
            className="sticky bottom-0 z-10 -mx-4 flex flex-wrap items-center gap-3 border-t bg-card/95 px-4 py-4 backdrop-blur sm:-mx-5 sm:px-5 lg:rounded-b-2xl"
            data-save-bar
          >
            {(detail.isDefault ? detail.states[entry.id] === "customized" : detail.states[entry.id] !== "not_started") ? (
              <Button variant="outline" className="h-12 rounded-xl border-input px-4 text-[15px] font-semibold text-[var(--cs-link)]" disabled={saving} onClick={() => setConfirmReset(true)}>
                <RotateCcw className="mr-2 h-4 w-4" />
                Reset section
              </Button>
            ) : null}
            <div className="ml-auto flex items-center gap-2">
              {dirty && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-12 w-12 rounded-xl text-[var(--cs-subtle)]"
                  disabled={saving}
                  title="Discard changes"
                  aria-label="Discard changes"
                  onClick={() => setDraft({ label: saved?.label ?? "", fields: { ...(saved?.fields ?? {}) } })}
                >
                  <Undo2 className="h-5 w-5" />
                </Button>
              )}
              <Button className="h-12 rounded-xl px-5 text-[15px]" onClick={() => void save()} disabled={!dirty || overLimit || missingRequired || saving}>
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
                Save changes
              </Button>
            </div>
          </div>
        ) : (
          <p className="flex items-center gap-1.5 pb-4 text-[13px] text-[var(--cs-subtle)]">
            <Lock className="h-3.5 w-3.5" />
            Only sub-account admins can edit content.
          </p>
        )}
      </div>
    ) : (
      <div className={cn(PANEL, "hidden items-center justify-center text-center text-[15px] text-[var(--cs-subtle)] lg:flex")}>Select an entry to edit its text.</div>
    );

  const systemCards = (
    <div className="relative grid grid-cols-3 gap-2 sm:gap-3 xl:w-[600px] xl:shrink-0" data-system-progress>
      {CONTENT_SYSTEMS.map((s) => {
        const p = systemProgress(statesFor(s.key));
        return (
          <div key={s.key} className="flex min-w-0 items-start gap-3 rounded-2xl border bg-card p-3 shadow-[0_1px_2px_rgba(26,18,56,0.04)] max-sm:flex-col max-sm:gap-2 sm:p-4">
            <IconTile icon={SYSTEM_ICON[s.key]} tone={SYSTEM_TONE[s.key]} shape="circle" size="sm" className="max-sm:hidden xl:h-9 xl:w-9" />
            <div className="min-w-0">
              <p className="text-[14px] font-semibold leading-tight text-[var(--cs-ink)] sm:text-[15px]">{s.label}</p>
              <div className="mt-1.5 flex items-center gap-2">
                <ProgressRing done={p.done} total={p.total} />
                <div className="min-w-0 leading-tight">
                  <p className="text-[13px] tabular-nums text-[var(--cs-ink)]">
                    {p.done} of {p.total}
                  </p>
                  <p className="truncate text-[12px] text-[var(--cs-subtle)]">{p.label}</p>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );

  return (
    <div className={cn(CS_SCOPE, "min-w-0 space-y-6")} data-content-set-editor>
      <PageHeader
        icon={tile.icon}
        iconTone={tile.tone}
        title={detail.name}
        description={detail.description || undefined}
        breadcrumb={
          <Breadcrumb
            items={[
              { label: "Energetic Decoder", onClick: onHome },
              { label: "Content Sets", onClick: () => navigate("back") },
              { label: detail.name },
            ]}
          />
        }
        aside={
          <div className="flex flex-col gap-3 xl:items-end">
            {systemCards}
          </div>
        }
      />
      <div className="flex flex-wrap items-center gap-2">
        <StatusPill status={detail.status} />
        {detail.isDefault && (
          <span className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--cs-tint)] px-3 py-1 text-[13px] font-medium text-[var(--cs-link)]">
            <Lock className="h-3.5 w-3.5" />
            Built-in
          </span>
        )}
      </div>

      <div data-editor-panes className="scroll-mt-3 max-lg:min-h-[calc(100dvh-1.5rem)] lg:grid lg:grid-cols-[250px_270px_minmax(0,1fr)] lg:items-start lg:gap-4 xl:grid-cols-[300px_300px_minmax(0,1fr)]">
        <div className={cn(step === "nav" ? "block" : "hidden", "lg:block")}>{nav}</div>
        <div className={cn(step === "entries" ? "block" : "hidden", "lg:block")}>{entryList}</div>
        <div className={cn(step === "entry" ? "block" : "hidden", "lg:block lg:h-full")}>{form}</div>
      </div>

      <Dialog open={!!pending} onOpenChange={(o) => !o && setPending(null)}>
        <DialogContent className={cn(CS_SCOPE, "rounded-2xl p-6 sm:max-w-md")}>
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold text-[var(--cs-ink)]">Discard unsaved changes?</DialogTitle>
            <DialogDescription className="text-[var(--cs-body)]">Your edits to {entry?.canonicalLabel} haven&apos;t been saved.</DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-3">
            <Button variant="outline" className="h-11 rounded-xl px-5" onClick={() => setPending(null)}>
              Keep editing
            </Button>
            <Button
              variant="destructive"
              className="h-11 rounded-xl px-5"
              onClick={() => {
                const next = pending;
                setPending(null);
                setDraft(null);
                if (next === "back") onBack();
                else if (next) onSelect(next);
              }}
            >
              Discard
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmReset} onOpenChange={setConfirmReset}>
        <DialogContent className={cn(CS_SCOPE, "rounded-2xl p-6 sm:max-w-md")}>
          <DialogHeader>
            <DialogTitle className="text-lg font-semibold text-[var(--cs-ink)]">{detail.isDefault ? "Reset to the Magnetix default?" : "Clear this entry?"}</DialogTitle>
            <DialogDescription className="text-[var(--cs-body)]">
              {detail.isDefault
                ? `${entry?.canonicalLabel} goes back to the shipped Magnetix wording. Readings already created keep their saved text.`
                : `Everything written for ${entry?.canonicalLabel} in this set is removed. Reports using this set will leave it blank.`}
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-3">
            <Button variant="outline" className="h-11 rounded-xl px-5" onClick={() => setConfirmReset(false)}>
              Cancel
            </Button>
            <Button variant="destructive" className="h-11 rounded-xl px-5" disabled={saving} onClick={() => void reset()}>
              {detail.isDefault ? "Reset" : "Clear"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
