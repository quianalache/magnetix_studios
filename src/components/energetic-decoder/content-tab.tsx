"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ChevronDown, ChevronUp, Loader2, RotateCcw, Search } from "lucide-react";
import { useSubAccount } from "@/context/sub-account-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ChartContentEditor } from "@/components/energetic-decoder/chart-content-editor";

interface ResolvedGate {
  gate: number;
  showsUp: string;
  giftText: string;
  isCustom: boolean;
}

/**
 * Content tab — the per-gate interpretive text library, split out of
 * Reports (2026-08-08) after auditing bodygraph.com's real architecture at
 * her request. Bodygraph keeps this as its own tool ("Chart Content /
 * Language"), completely separate from Reports: Reports there is pure
 * assembly/delivery — its "shortcodes" pull content from here at
 * generation time rather than storing text per report. Same relationship
 * here — Reports (sequences a reading includes) never touches gate text;
 * this is the one place it lives, rewrite a gate once and every reading
 * that includes it picks up the change.
 *
 * Extended 2026-08-08: shipped with only the Gene Keys gate editor even
 * after Human Design and Astrology went live — their content had real
 * defaults but no way to touch them, an inconsistency she caught. Now a
 * three-way switcher; Human Design/Astrology delegate to the shared
 * ChartContentEditor (chart-content-editor.tsx) rather than a hand-built
 * copy of this file's own gate-list UI.
 */
export function EnergeticDecoderContentTab() {
  const [system, setSystem] = useState<"geneKeys" | "hd" | "astro">("geneKeys");

  return (
    <div className="space-y-5">
      <div className="flex gap-1.5">
        {(
          [
            { key: "geneKeys", label: "Frequency" },
            { key: "hd", label: "Human Design" },
            { key: "astro", label: "Astrology" },
          ] as const
        ).map((s) => (
          <button
            key={s.key}
            type="button"
            onClick={() => setSystem(s.key)}
            className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors ${
              system === s.key
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:text-foreground"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      {system === "geneKeys" && <GeneKeysGateEditor />}
      {system === "hd" && <ChartContentEditor system="hd" />}
      {system === "astro" && <ChartContentEditor system="astro" />}
    </div>
  );
}

function GeneKeysGateEditor() {
  const { subAccountId } = useSubAccount();

  const [gates, setGates] = useState<ResolvedGate[]>([]);
  const [gatesLoading, setGatesLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [expandedGate, setExpandedGate] = useState<number | null>(null);
  const [draft, setDraft] = useState<{ showsUp: string; giftText: string }>({ showsUp: "", giftText: "" });
  const [savingGate, setSavingGate] = useState(false);

  async function loadGates() {
    setGatesLoading(true);
    try {
      const res = await fetch(`/api/sub-accounts/${subAccountId}/energetic-decoder/gate-content`);
      const data = (await res.json().catch(() => ({}))) as { gates?: ResolvedGate[] };
      setGates(data.gates ?? []);
    } finally {
      setGatesLoading(false);
    }
  }

  useEffect(() => {
    if (subAccountId) void loadGates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subAccountId]);

  function openGate(g: ResolvedGate) {
    if (expandedGate === g.gate) {
      setExpandedGate(null);
      return;
    }
    setExpandedGate(g.gate);
    setDraft({ showsUp: g.showsUp, giftText: g.giftText });
  }

  async function saveGate(gate: number) {
    if (!draft.showsUp.trim() || !draft.giftText.trim()) {
      toast.error("Both fields are required.");
      return;
    }
    setSavingGate(true);
    try {
      const res = await fetch(
        `/api/sub-accounts/${subAccountId}/energetic-decoder/gate-content/${gate}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(draft),
        },
      );
      if (!res.ok) throw new Error();
      toast.success(`Gate ${gate} updated.`);
      setExpandedGate(null);
      await loadGates();
    } catch {
      toast.error("Couldn't save. Try again.");
    } finally {
      setSavingGate(false);
    }
  }

  async function resetGate(gate: number) {
    setSavingGate(true);
    try {
      const res = await fetch(
        `/api/sub-accounts/${subAccountId}/energetic-decoder/gate-content/${gate}`,
        { method: "DELETE" },
      );
      if (!res.ok) throw new Error();
      toast.success(`Gate ${gate} reset to default.`);
      setExpandedGate(null);
      await loadGates();
    } catch {
      toast.error("Couldn't reset. Try again.");
    } finally {
      setSavingGate(false);
    }
  }

  const filteredGates = gates.filter((g) => {
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    return String(g.gate).includes(q) || g.showsUp.toLowerCase().includes(q) || g.giftText.toLowerCase().includes(q);
  });
  const customCount = gates.filter((g) => g.isCustom).length;

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border bg-card p-6">
        <header className="mb-4">
          <h3 className="text-base font-semibold">Gate content</h3>
          <p className="mt-0.5 text-sm text-muted-foreground">
            What each gate actually says — the source of truth every reading pulls from. Ships with
            real default text; rewrite any gate in your own voice and it updates everywhere that gate
            appears.
            {!gatesLoading && (
              <span className="ml-1">{customCount} of 64 customized.</span>
            )}
          </p>
        </header>

        <div className="relative mb-3">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by gate number or word…"
            className="pl-8"
          />
        </div>

        {gatesLoading ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>
        ) : (
          <div className="max-h-[560px] divide-y overflow-y-auto rounded-lg border">
            {filteredGates.map((g) => (
              <div key={g.gate}>
                <button
                  type="button"
                  onClick={() => openGate(g)}
                  className="flex w-full items-center justify-between gap-3 px-3.5 py-2.5 text-left hover:bg-muted/50"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="w-7 shrink-0 text-center text-xs font-bold text-muted-foreground">
                      {g.gate}
                    </span>
                    <span className="truncate text-sm">{g.showsUp}</span>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {g.isCustom && (
                      <span className="rounded-full bg-violet-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-violet-600 dark:text-violet-400">
                        Custom
                      </span>
                    )}
                    {expandedGate === g.gate ? (
                      <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                    )}
                  </div>
                </button>
                {expandedGate === g.gate && (
                  <div className="space-y-3 border-t bg-muted/20 px-3.5 py-3.5">
                    <div className="space-y-1.5">
                      <Label className="text-xs">How the shadow shows up</Label>
                      <Textarea
                        rows={2}
                        value={draft.showsUp}
                        onChange={(e) => setDraft((d) => ({ ...d, showsUp: e.target.value }))}
                        className="text-sm"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">How the gift shows up</Label>
                      <Textarea
                        rows={2}
                        value={draft.giftText}
                        onChange={(e) => setDraft((d) => ({ ...d, giftText: e.target.value }))}
                        className="text-sm"
                      />
                    </div>
                    <div className="flex items-center justify-end gap-2">
                      {g.isCustom && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => resetGate(g.gate)}
                          disabled={savingGate}
                        >
                          <RotateCcw className="mr-1 h-3 w-3" />
                          Reset to default
                        </Button>
                      )}
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => saveGate(g.gate)}
                        disabled={savingGate}
                      >
                        {savingGate ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : null}
                        Save
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ))}
            {filteredGates.length === 0 && (
              <p className="py-8 text-center text-xs text-muted-foreground">No gates match.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
