"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ChevronDown, ChevronUp, Loader2, RotateCcw, Search } from "lucide-react";
import { useSubAccount } from "@/context/sub-account-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface ContentItem {
  id: string;
  system: "hd" | "astro";
  category: string;
  key: string;
  label: string;
  fields: Record<string, string>;
  isCustom: boolean;
}

const FIELD_LABELS: Record<string, string> = {
  strategy: "Strategy",
  description: "Description",
  definedText: "When defined",
  undefinedText: "When undefined",
  theme: "Theme",
};

const CATEGORY_GROUPS: Record<"hd" | "astro", { category: string; title: string }[]> = {
  hd: [
    { category: "type", title: "Types" },
    { category: "authority", title: "Authorities" },
    { category: "center", title: "Centers" },
  ],
  astro: [
    { category: "sign", title: "Signs" },
    { category: "house", title: "Houses" },
    { category: "aspect", title: "Aspect Types" },
  ],
};

/**
 * Human Design / Astrology content editor — same override/reset pattern as
 * the Gene Keys gate editor (content-tab.tsx), generalized across both
 * systems' content items instead of a separate hand-built UI per category.
 * Was the gap she caught 2026-08-08: this content had real defaults but no
 * editor at all, unlike gates.
 */
export function ChartContentEditor({ system }: { system: "hd" | "astro" }) {
  const { subAccountId } = useSubAccount();
  const [items, setItems] = useState<ContentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch(`/api/sub-accounts/${subAccountId}/energetic-decoder/chart-content`);
      const data = (await res.json().catch(() => ({}))) as { items?: ContentItem[] };
      setItems(data.items ?? []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (subAccountId) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subAccountId]);

  function openItem(item: ContentItem) {
    if (expandedId === item.id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(item.id);
    setDraft(item.fields);
  }

  async function saveItem(item: ContentItem) {
    for (const key of Object.keys(item.fields)) {
      if (!draft[key]?.trim()) {
        toast.error("Every field is required.");
        return;
      }
    }
    setSaving(true);
    try {
      const res = await fetch(
        `/api/sub-accounts/${subAccountId}/energetic-decoder/chart-content/${encodeURIComponent(item.id)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(draft),
        },
      );
      if (!res.ok) throw new Error();
      toast.success(`${item.label} updated.`);
      setExpandedId(null);
      await load();
    } catch {
      toast.error("Couldn't save. Try again.");
    } finally {
      setSaving(false);
    }
  }

  async function resetItem(item: ContentItem) {
    setSaving(true);
    try {
      const res = await fetch(
        `/api/sub-accounts/${subAccountId}/energetic-decoder/chart-content/${encodeURIComponent(item.id)}`,
        { method: "DELETE" },
      );
      if (!res.ok) throw new Error();
      toast.success(`${item.label} reset to default.`);
      setExpandedId(null);
      await load();
    } catch {
      toast.error("Couldn't reset. Try again.");
    } finally {
      setSaving(false);
    }
  }

  const groups = CATEGORY_GROUPS[system];
  const q = search.trim().toLowerCase();
  const matches = (i: ContentItem) =>
    !q || i.label.toLowerCase().includes(q) || Object.values(i.fields).some((v) => v.toLowerCase().includes(q));
  const bySystem = items.filter((i) => i.system === system);
  const visible = bySystem.filter(matches);
  const customCount = bySystem.filter((i) => i.isCustom).length;

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border bg-card p-6">
        <header className="mb-4">
          <h3 className="text-base font-semibold">
            {system === "hd" ? "Human Design content" : "Astrology content"}
          </h3>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {system === "hd"
              ? "What each Type, Authority, and Center actually says — the source every Human Design reading pulls from."
              : "What each Sign, House, and Aspect Type actually says — the source every Astrology reading pulls from."}{" "}
            Ships with real default text; rewrite any item in your own voice and it updates everywhere it appears.
            {!loading && <span className="ml-1">{customCount} of {bySystem.length} customized.</span>}
          </p>
        </header>

        <div className="relative mb-3">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search…"
            className="pl-8"
          />
        </div>

        {loading ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>
        ) : (
          <div className="space-y-4">
            {groups.map((group) => {
              const groupItems = visible.filter((i) => i.category === group.category);
              if (groupItems.length === 0) return null;
              return (
                <div key={group.category}>
                  <p className="mb-1.5 px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {group.title}
                  </p>
                  <div className="divide-y overflow-hidden rounded-lg border">
                    {groupItems.map((item) => (
                      <div key={item.id}>
                        <button
                          type="button"
                          onClick={() => openItem(item)}
                          className="flex w-full items-center justify-between gap-3 px-3.5 py-2.5 text-left hover:bg-muted/50"
                        >
                          <span className="truncate text-sm font-medium">{item.label}</span>
                          <div className="flex shrink-0 items-center gap-2">
                            {item.isCustom && (
                              <span className="rounded-full bg-violet-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-violet-600 dark:text-violet-400">
                                Custom
                              </span>
                            )}
                            {expandedId === item.id ? (
                              <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
                            ) : (
                              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                            )}
                          </div>
                        </button>
                        {expandedId === item.id && (
                          <div className="space-y-3 border-t bg-muted/20 px-3.5 py-3.5">
                            {Object.keys(item.fields).map((key) => (
                              <div key={key} className="space-y-1.5">
                                <Label className="text-xs">{FIELD_LABELS[key] ?? key}</Label>
                                <Textarea
                                  rows={2}
                                  value={draft[key] ?? ""}
                                  onChange={(e) => setDraft((d) => ({ ...d, [key]: e.target.value }))}
                                  className="text-sm"
                                />
                              </div>
                            ))}
                            <div className="flex items-center justify-end gap-2">
                              {item.isCustom && (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => resetItem(item)}
                                  disabled={saving}
                                >
                                  <RotateCcw className="mr-1 h-3 w-3" />
                                  Reset to default
                                </Button>
                              )}
                              <Button type="button" size="sm" onClick={() => saveItem(item)} disabled={saving}>
                                {saving ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
                                Save
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
            {visible.length === 0 && <p className="py-8 text-center text-xs text-muted-foreground">No matches.</p>}
          </div>
        )}
      </div>
    </div>
  );
}
