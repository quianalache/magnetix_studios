"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Loader2, RotateCcw, Search } from "lucide-react";
import { useSubAccount } from "@/context/sub-account-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

interface ResolvedGate {
  gate: number;
  showsUp: string;
  giftText: string;
  isCustom: boolean;
}

interface ChartContentItem {
  id: string;
  system: "hd" | "astro";
  category: string;
  key: string;
  label: string;
  fields: Record<string, string>;
  isCustom: boolean;
}

/** One shape for both real sources (gate-content's Gene Keys gates, chart-content's HD/Astrology items) so the list/detail workbench below doesn't need to know which API a row came from. */
interface UnifiedItem {
  uid: string;
  group: string;
  title: string;
  meta: string;
  isCustom: boolean;
  fields: { key: string; label: string; value: string }[];
}

const FIELD_LABELS: Record<string, string> = {
  showsUp: "How the shadow shows up",
  giftText: "How the gift shows up",
  strategy: "Strategy",
  description: "Description",
  definedText: "When defined",
  undefinedText: "When undefined",
  theme: "Theme",
  name: "Name",
  strengthHeadline: "Strength headline (Skills & Attributes)",
  framing: "Framing line (Skills & Attributes)",
};

const GROUP_ORDER = [
  "Frequency — Gates",
  "Human Design — Types",
  "Human Design — Authorities",
  "Human Design — Centers",
  "Human Design — Profile Lines",
  "Human Design — Digestion",
  "Human Design — Sense",
  "Human Design — Design Sense",
  "Human Design — Motivation",
  "Human Design — Perspective",
  "Human Design — Environment",
  "Human Design — Cross Angles",
  "Human Design — Skills & Attributes (legacy, unused)",
  "Astrology — Signs",
  "Astrology — Houses",
  "Astrology — Aspect Types",
];

const CATEGORY_GROUP_LABEL: Record<string, string> = {
  type: "Human Design — Types",
  authority: "Human Design — Authorities",
  // Centers' strengthHeadline field (2026-08-11) feeds the local Skills &
  // Attributes section's "Core Strengths" layer — see
  // human-design-skills-service.ts. Same item as before, one more
  // editable field, no new group needed.
  center: "Human Design — Centers",
  line: "Human Design — Profile Lines",
  digestion: "Human Design — Digestion",
  sense: "Human Design — Sense",
  designSense: "Human Design — Design Sense",
  motivation: "Human Design — Motivation",
  perspective: "Human Design — Perspective",
  environment: "Human Design — Environment",
  // Right Angle / Left Angle / Juxtaposition — added 2026-08-11, feeds the
  // Skills section's optional framing line. Only 3 possible keys.
  crossAngle: "Human Design — Cross Angles",
  // Bodygraph-sourced Skills & Attributes entries, cached here while that
  // integration was still live — orphaned as of 2026-08-11: Skills &
  // Attributes is now the Magnetix-native, chart-derived section built
  // from Centers/Channels/Gates (human-design-skills-service.ts), which
  // doesn't read this category at all. Left in place (not deleted, per
  // her explicit instruction not to delete bodygraphVariableDefaults) so
  // nothing breaks for anyone who already customized one of these, but
  // editing an item here no longer changes any reading.
  skill: "Human Design — Skills & Attributes (legacy, unused)",
  sign: "Astrology — Signs",
  house: "Astrology — Houses",
  aspect: "Astrology — Aspect Types",
};

/**
 * Content — full rebuild 2026-08-10 to actually match the approved
 * workbench mockup: one unified searchable list (Frequency gates + Human
 * Design + Astrology together, grouped by category) with a persistent
 * detail editor on the right, instead of three separate accordion tabs
 * (the gap she found comparing real screenshots against the mockup
 * directly). Same two real APIs as before — gate-content for Frequency,
 * chart-content for Human Design/Astrology — merged client-side into one
 * list; save/reset still calls whichever real endpoint a row actually
 * came from.
 */
export function EnergeticDecoderContentTab() {
  const { subAccountId } = useSubAccount();
  const [gates, setGates] = useState<ResolvedGate[]>([]);
  const [chartItems, setChartItems] = useState<ChartContentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedUid, setSelectedUid] = useState<string | null>(null);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const [gateRes, chartRes] = await Promise.all([
        fetch(`/api/sub-accounts/${subAccountId}/energetic-decoder/gate-content`),
        fetch(`/api/sub-accounts/${subAccountId}/energetic-decoder/chart-content`),
      ]);
      const gData = (await gateRes.json().catch(() => ({}))) as { gates?: ResolvedGate[] };
      const cData = (await chartRes.json().catch(() => ({}))) as { items?: ChartContentItem[] };
      setGates(gData.gates ?? []);
      setChartItems(cData.items ?? []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (subAccountId) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subAccountId]);

  const unified: UnifiedItem[] = useMemo(() => {
    const fromGates: UnifiedItem[] = gates.map((g) => ({
      uid: `gate-${g.gate}`,
      group: "Frequency — Gates",
      title: `Gate ${g.gate}`,
      meta: g.showsUp,
      isCustom: g.isCustom,
      fields: [
        { key: "showsUp", label: FIELD_LABELS.showsUp, value: g.showsUp },
        { key: "giftText", label: FIELD_LABELS.giftText, value: g.giftText },
      ],
    }));
    const fromChart: UnifiedItem[] = chartItems.map((i) => ({
      uid: `chart-${i.id}`,
      group: CATEGORY_GROUP_LABEL[i.category] ?? `${i.system === "hd" ? "Human Design" : "Astrology"} — ${i.category}`,
      title: i.label,
      meta: Object.values(i.fields)[0] ?? "",
      isCustom: i.isCustom,
      fields: Object.entries(i.fields).map(([key, value]) => ({ key, label: FIELD_LABELS[key] ?? key, value })),
    }));
    return [...fromGates, ...fromChart];
  }, [gates, chartItems]);

  const q = search.trim().toLowerCase();
  const visible = unified.filter(
    (i) => !q || i.title.toLowerCase().includes(q) || i.meta.toLowerCase().includes(q) || i.fields.some((f) => f.value.toLowerCase().includes(q)),
  );
  const grouped = GROUP_ORDER.map((g) => ({ group: g, items: visible.filter((i) => i.group === g) })).filter((g) => g.items.length > 0);

  const selected = unified.find((i) => i.uid === selectedUid) ?? visible[0] ?? null;
  const customCount = unified.filter((i) => i.isCustom).length;

  function openItem(item: UnifiedItem) {
    setSelectedUid(item.uid);
    setDraft(Object.fromEntries(item.fields.map((f) => [f.key, f.value])));
  }

  async function saveItem() {
    if (!selected) return;
    for (const f of selected.fields) {
      if (!draft[f.key]?.trim()) {
        toast.error("Every field is required.");
        return;
      }
    }
    setSaving(true);
    try {
      const isGate = selected.uid.startsWith("gate-");
      const url = isGate
        ? `/api/sub-accounts/${subAccountId}/energetic-decoder/gate-content/${selected.uid.replace("gate-", "")}`
        : `/api/sub-accounts/${subAccountId}/energetic-decoder/chart-content/${encodeURIComponent(selected.uid.replace("chart-", ""))}`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      if (!res.ok) throw new Error();
      toast.success(`${selected.title} updated.`);
      await load();
    } catch {
      toast.error("Couldn't save. Try again.");
    } finally {
      setSaving(false);
    }
  }

  async function resetItem() {
    if (!selected) return;
    setSaving(true);
    try {
      const isGate = selected.uid.startsWith("gate-");
      const url = isGate
        ? `/api/sub-accounts/${subAccountId}/energetic-decoder/gate-content/${selected.uid.replace("gate-", "")}`
        : `/api/sub-accounts/${subAccountId}/energetic-decoder/chart-content/${encodeURIComponent(selected.uid.replace("chart-", ""))}`;
      const res = await fetch(url, { method: "DELETE" });
      if (!res.ok) throw new Error();
      toast.success(`${selected.title} reset to default.`);
      await load();
    } catch {
      toast.error("Couldn't reset. Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold">Content</h2>
        <p className="text-sm text-muted-foreground">
          What each gate, type, sign, or field actually says — the source every reading pulls from. Ships with real
          default text; rewrite anything in your own voice and it updates everywhere it appears.
          {!loading && <span className="ml-1">{customCount} of {unified.length} customized.</span>}
        </p>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(280px,340px)_1fr]">
          {/* List pane */}
          <div className="flex h-[640px] flex-col overflow-hidden rounded-2xl border bg-card">
            <div className="border-b p-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by gate, type, sign…"
                  className="pl-8"
                />
              </div>
            </div>
            <div className="flex-1 overflow-y-auto">
              {grouped.map(({ group, items }) => (
                <div key={group}>
                  <p className="sticky top-0 z-[1] bg-card px-3.5 py-1.5 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                    {group}
                  </p>
                  <div className="divide-y">
                    {items.map((item) => (
                      <button
                        key={item.uid}
                        type="button"
                        onClick={() => openItem(item)}
                        className={cn(
                          "flex w-full items-start justify-between gap-2 px-3.5 py-2.5 text-left hover:bg-accent/40",
                          selected?.uid === item.uid && "bg-accent/60 shadow-[inset_3px_0_0_0_var(--primary)]",
                        )}
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium">{item.title}</span>
                          <span className="block truncate text-xs text-muted-foreground">{item.meta}</span>
                        </span>
                        {item.isCustom && (
                          <span className="shrink-0 rounded-full bg-violet-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-violet-600 dark:text-violet-400">
                            Custom
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
              {visible.length === 0 && <p className="py-8 text-center text-xs text-muted-foreground">No matches.</p>}
            </div>
          </div>

          {/* Detail pane */}
          <div className="h-[640px] overflow-y-auto rounded-2xl border bg-card">
            {!selected ? (
              <p className="p-6 text-center text-sm text-muted-foreground">Select an item.</p>
            ) : (
              <>
                <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b bg-card p-4">
                  <div>
                    <p className="text-sm font-bold">{selected.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {selected.group} · {selected.isCustom ? "customized" : "not yet customized"}
                    </p>
                  </div>
                  {selected.isCustom && (
                    <Button type="button" variant="ghost" size="sm" onClick={resetItem} disabled={saving}>
                      <RotateCcw className="mr-1 h-3 w-3" />
                      Reset to default
                    </Button>
                  )}
                </div>
                <div className="space-y-4 p-4">
                  {selected.fields.map((f) => (
                    <div key={f.key} className="space-y-1.5">
                      <Label className="text-xs">{f.label}</Label>
                      <Textarea
                        rows={3}
                        value={draft[f.key] ?? ""}
                        onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
                        className="text-sm"
                      />
                    </div>
                  ))}
                  <Button type="button" onClick={saveItem} disabled={saving}>
                    {saving ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
                    Save
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
