"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, ChevronRight, Eye, EyeOff, Info, Loader2, Lock, RotateCcw, Search, Undo2 } from "lucide-react";
import { useSubAccount } from "@/context/sub-account-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  CONTENT_CATEGORIES,
  CONTENT_SYSTEMS,
  CONTENT_TERM_MAX,
  ENTRY_STATE_LABEL,
  categorySchema,
  systemProgress,
  type ContentCatalogEntry,
  type ContentCategorySchema,
  type ContentEntryState,
  type ContentEntryValues,
  type ContentSetStatus,
  type ContentSystem,
} from "@/lib/energetic-decoder/content-sets";
import { StatusPill } from "@/components/energetic-decoder/content-sets-library";

/**
 * Content Set editor (2026-10-07). Desktop: three columns (systems &
 * categories → entries → the entry's fixed fields). Below `lg`: the same
 * three steps one at a time, each a normal page-flow screen (no nested
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

const STATE_STYLE: Record<ContentEntryState, string> = {
  complete: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
  customized: "bg-violet-500/10 text-violet-700 dark:text-violet-400",
  needs_content: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  not_started: "bg-muted text-muted-foreground",
};

function StatePill({ state }: { state: ContentEntryState }) {
  return <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold", STATE_STYLE[state])}>{ENTRY_STATE_LABEL[state]}</span>;
}

export function ContentSetEditor({
  setId,
  selection,
  onSelect,
  onBack,
}: {
  setId: string;
  selection: EditorSelection;
  onSelect: (next: EditorSelection, opts?: { push?: boolean }) => void;
  onBack: () => void;
}) {
  const { subAccountId, isAdmin } = useSubAccount();
  const base = `/api/sub-accounts/${subAccountId}/energetic-decoder/content-sets/${setId}`;
  const [detail, setDetail] = useState<SetDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
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
      <div className="space-y-3 rounded-2xl border bg-card p-6 text-sm text-muted-foreground">
        <p>{loadError}</p>
        <Button variant="outline" onClick={onBack}>
          <ArrowLeft className="mr-1.5 h-4 w-4" />
          Back to Content Sets
        </Button>
      </div>
    );
  }
  if (!detail) return <div className="h-96 animate-pulse rounded-2xl bg-muted/20" />;

  const q = query.trim().toLowerCase();
  const shownEntries = entries.filter((e) => {
    if (!q) return true;
    const v = detail.values[e.id];
    return e.canonicalLabel.toLowerCase().includes(q) || (v?.label ?? "").toLowerCase().includes(q) || Object.values(v?.fields ?? {}).some((t) => t.toLowerCase().includes(q));
  });

  // Step shown below `lg`: the deepest thing selected.
  const step: "nav" | "entries" | "entry" = entry ? "entry" : selection.category ? "entries" : "nav";

  const statesFor = (sys: ContentSystem, cat?: string) => detail.catalog.filter((e) => e.system === sys && (!cat || e.category === cat)).map((e) => detail.states[e.id]);

  const nav = (
    <nav aria-label="Systems and categories" className="space-y-4" data-editor-step="nav">
      {CONTENT_SYSTEMS.map((s) => {
        const p = systemProgress(statesFor(s.key));
        const cats = CONTENT_CATEGORIES.filter((c) => c.system === s.key && detail.catalog.some((e) => e.system === c.system && e.category === c.category));
        return (
          <div key={s.key} className="space-y-1.5">
            <div className="flex items-baseline justify-between gap-2 px-1">
              <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{s.label}</p>
              <p className="text-[11px] tabular-nums text-muted-foreground" title={p.label}>
                {p.done} of {p.total}
              </p>
            </div>
            <div className="mx-1 h-1 overflow-hidden rounded-full bg-muted" aria-hidden>
              <div className="h-full rounded-full bg-primary" style={{ width: `${p.total ? (p.done / p.total) * 100 : 0}%` }} />
            </div>
            <ul className="space-y-0.5">
              {cats.map((c) => {
                const cp = systemProgress(statesFor(c.system, c.category));
                const active = category?.id === c.id;
                return (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => navigate({ system: c.system, category: c.category, entry: null })}
                      aria-current={active ? "true" : undefined}
                      className={cn(
                        "flex min-h-11 w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-sm hover:bg-muted/60 lg:min-h-0",
                        active && "bg-primary/10 font-semibold text-foreground",
                      )}
                    >
                      <span className="truncate">{c.label}</span>
                      <span className="flex shrink-0 items-center gap-1 text-[11px] tabular-nums text-muted-foreground">
                        {cp.done}/{cp.total}
                        <ChevronRight className="h-3.5 w-3.5 lg:hidden" />
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </nav>
  );

  const entryList = category && (
    <div className="min-w-0 space-y-3" data-editor-step="entries">
      <div className="flex items-center gap-2 lg:hidden">
        <Button variant="ghost" size="sm" onClick={() => navigate({ system, category: null, entry: null })}>
          <ArrowLeft className="mr-1 h-4 w-4" />
          Categories
        </Button>
      </div>
      <div>
        <p className="text-sm font-semibold">{category.label}</p>
        <p className="text-xs text-muted-foreground">{CONTENT_SYSTEMS.find((s) => s.key === category.system)?.label}</p>
      </div>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={`Search ${category.label.toLowerCase()}…`} className="pl-9" aria-label={`Search ${category.label}`} />
      </div>
      <ul className="divide-y rounded-xl border">
        {shownEntries.map((e) => {
          const v = detail.values[e.id];
          const term = v?.label?.trim();
          return (
            <li key={e.id}>
              <button
                type="button"
                onClick={() => navigate({ system: e.system, category: e.category, entry: e.id })}
                aria-current={entry?.id === e.id ? "true" : undefined}
                className={cn("flex min-h-12 w-full items-center justify-between gap-2 px-3 py-2.5 text-left hover:bg-muted/50", entry?.id === e.id && "bg-primary/5 shadow-[inset_3px_0_0_0_var(--primary)]")}
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{term || e.canonicalLabel}</span>
                  {term && <span className="block truncate text-[11px] text-muted-foreground">{e.canonicalLabel}</span>}
                </span>
                <StatePill state={detail.states[e.id]} />
              </button>
            </li>
          );
        })}
        {shownEntries.length === 0 && <li className="px-3 py-6 text-center text-xs text-muted-foreground">No matches.</li>}
      </ul>
    </div>
  );

  const ref = entry ? detail.defaults[entry.id] : undefined;
  const form =
    entry && entrySchema && draft ? (
      <div className="min-w-0 space-y-4" data-editor-step="entry" data-entry-form>
        <div className="flex items-center gap-2 lg:hidden">
          <Button variant="ghost" size="sm" onClick={() => navigate({ system: entry.system, category: entry.category, entry: null })}>
            <ArrowLeft className="mr-1 h-4 w-4" />
            {entrySchema.label}
          </Button>
        </div>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-lg font-semibold">{draft.label?.trim() || entry.canonicalLabel}</p>
            <p className="text-xs text-muted-foreground">
              {CONTENT_SYSTEMS.find((s) => s.key === entry.system)?.label} · {entrySchema.noun}
            </p>
          </div>
          <StatePill state={detail.states[entry.id]} />
        </div>

        {!detail.isDefault && (
          <div className="space-y-1.5 rounded-xl border bg-muted/20 p-3">
            <Label htmlFor="cs-term">Custom term</Label>
            <Input
              id="cs-term"
              value={draft.label ?? ""}
              onChange={(e) => setDraft((d) => (d ? { ...d, label: e.target.value } : d))}
              placeholder={entry.canonicalLabel}
              readOnly={!canEdit}
              aria-invalid={(draft.label ?? "").trim().length > CONTENT_TERM_MAX}
            />
            <p className="text-xs text-muted-foreground">
              Optional. Shown in reports instead of “{entry.canonicalLabel}”. The calculated value itself never changes.
            </p>
          </div>
        )}

        {!detail.isDefault && (
          <button type="button" onClick={() => setShowReference((s) => !s)} className="inline-flex items-center gap-1.5 text-xs font-medium text-primary">
            {showReference ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            {showReference ? "Hide Default text" : "Show Default text for reference"}
          </button>
        )}

        {entrySchema.fields.map((f) => {
          const value = draft.fields[f.key] ?? "";
          const len = value.trim().length;
          const over = len > f.max;
          const blank = len === 0;
          return (
            <div key={f.key} className="space-y-1.5">
              <div className="flex items-baseline justify-between gap-2">
                <Label htmlFor={`cs-f-${f.key}`}>{f.label}</Label>
                <span className={cn("shrink-0 whitespace-nowrap text-[11px] tabular-nums", over ? "font-semibold text-destructive" : "text-muted-foreground")}>
                  {len} / {f.max}
                </span>
              </div>
              {f.long ? (
                <Textarea
                  id={`cs-f-${f.key}`}
                  rows={5}
                  value={value}
                  readOnly={!canEdit}
                  aria-invalid={over}
                  onChange={(e) => setDraft((d) => (d ? { ...d, fields: { ...d.fields, [f.key]: e.target.value } } : d))}
                  className="text-sm"
                />
              ) : (
                <Input
                  id={`cs-f-${f.key}`}
                  value={value}
                  readOnly={!canEdit}
                  aria-invalid={over}
                  onChange={(e) => setDraft((d) => (d ? { ...d, fields: { ...d.fields, [f.key]: e.target.value } } : d))}
                />
              )}
              {f.hint && <p className="text-xs text-muted-foreground">{f.hint}</p>}
              {blank && !detail.isDefault && <p className="text-xs text-amber-700 dark:text-amber-400">Blank — reports using this set will leave this empty.</p>}
              {blank && detail.isDefault && <p className="text-xs text-destructive">Required in the Default set.</p>}
              {showReference && !detail.isDefault && (
                <div className="rounded-lg border border-dashed bg-muted/20 p-2.5 text-xs text-muted-foreground" data-default-reference>
                  <span className="mb-1 block font-semibold uppercase tracking-wide">Default</span>
                  <span className="whitespace-pre-wrap">{ref?.fields?.[f.key] || "—"}</span>
                </div>
              )}
            </div>
          );
        })}

        {canEdit ? (
          <div className="sticky bottom-0 z-10 -mx-4 flex flex-wrap items-center gap-2 border-t bg-card/95 px-4 py-3 backdrop-blur lg:mx-0 lg:rounded-b-xl lg:px-0" data-save-bar>
            <Button onClick={() => void save()} disabled={!dirty || overLimit || missingRequired || saving}>
              {saving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
              Save
            </Button>
            <Button variant="outline" disabled={!dirty || saving} onClick={() => setDraft({ label: saved?.label ?? "", fields: { ...(saved?.fields ?? {}) } })}>
              <Undo2 className="mr-1.5 h-4 w-4" />
              Revert changes
            </Button>
            {detail.isDefault
              ? detail.states[entry.id] === "customized" && (
                  <Button variant="ghost" disabled={saving} onClick={() => setConfirmReset(true)}>
                    <RotateCcw className="mr-1.5 h-4 w-4" />
                    Reset to Magnetix default
                  </Button>
                )
              : detail.states[entry.id] !== "not_started" && (
                  <Button variant="ghost" disabled={saving} onClick={() => setConfirmReset(true)}>
                    <RotateCcw className="mr-1.5 h-4 w-4" />
                    Clear entry
                  </Button>
                )}
          </div>
        ) : (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Lock className="h-3.5 w-3.5" />
            Only sub-account admins can edit content.
          </p>
        )}
      </div>
    ) : (
      <div className="hidden rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground lg:block">Select an entry to edit its text.</div>
    );

  return (
    <div className="min-w-0 space-y-4" data-content-set-editor>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <button type="button" onClick={() => navigate("back")} className="mb-1 inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-3.5 w-3.5" />
            Content Sets
          </button>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="min-w-0 break-words text-lg font-semibold">{detail.name}</h2>
            <StatusPill status={detail.status} />
            {detail.isDefault && (
              <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary">
                <Lock className="h-2.5 w-2.5" />
                Built-in
              </span>
            )}
          </div>
          {detail.description && <p className="mt-0.5 text-sm text-muted-foreground">{detail.description}</p>}
        </div>
      </div>

      <div className="flex items-start gap-2.5 rounded-xl border border-primary/20 bg-primary/5 p-3 text-sm" role="note">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        {detail.isDefault ? (
          <p>
            Default is the built-in Magnetix content, including your edits. It&apos;s what new readings use today. Every field is
            required here, and Reset returns an entry to the Magnetix wording.
          </p>
        ) : (
          <p>
            Missing content will remain blank in reports — Magnetix never fills gaps with Default text. You&apos;ll be warned about
            blanks before generating a report.
          </p>
        )}
      </div>

      <div data-editor-panes className="scroll-mt-3 rounded-2xl max-lg:min-h-[calc(100dvh-1.5rem)] border bg-card p-4 lg:grid lg:grid-cols-[220px_minmax(0,280px)_minmax(0,1fr)] lg:gap-6 lg:p-5">
        <div className={cn(step === "nav" ? "block" : "hidden", "lg:block")}>{nav}</div>
        <div className={cn(step === "entries" ? "block" : "hidden", "lg:block")}>{entryList}</div>
        <div className={cn(step === "entry" ? "block" : "hidden", "lg:block")}>{form}</div>
      </div>

      <Dialog open={!!pending} onOpenChange={(o) => !o && setPending(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Discard unsaved changes?</DialogTitle>
            <DialogDescription>Your edits to {entry?.canonicalLabel} haven&apos;t been saved.</DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setPending(null)}>
              Keep editing
            </Button>
            <Button
              variant="destructive"
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
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{detail.isDefault ? "Reset to the Magnetix default?" : "Clear this entry?"}</DialogTitle>
            <DialogDescription>
              {detail.isDefault
                ? `${entry?.canonicalLabel} goes back to the shipped Magnetix wording. Readings already created keep their saved text.`
                : `Everything written for ${entry?.canonicalLabel} in this set is removed. Reports using this set will leave it blank.`}
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setConfirmReset(false)}>
              Cancel
            </Button>
            <Button variant="destructive" disabled={saving} onClick={() => void reset()}>
              {detail.isDefault ? "Reset" : "Clear"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
