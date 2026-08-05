"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ChevronDown, ChevronUp, Loader2, RotateCcw, Search } from "lucide-react";
import { useSubAccount } from "@/context/sub-account-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  defaultEnergeticDecoderReportConfig,
  type EnergeticDecoderReportConfig,
} from "@/types/energetic-decoder";

interface ResolvedGate {
  gate: number;
  showsUp: string;
  giftText: string;
  isCustom: boolean;
}

const SEQUENCES: {
  key: keyof EnergeticDecoderReportConfig;
  name: string;
  spheres: string;
}[] = [
  { key: "includeActivation", name: "Activation Sequence", spheres: "Life's Work · Evolution · Radiance · Purpose" },
  { key: "includeVenus", name: "Venus Sequence", spheres: "Attraction · IQ · EQ · SQ" },
  { key: "includePearl", name: "Pearl Sequence", spheres: "Vocation · Brand · Culture · Pearl" },
];

/**
 * Reports tab — where a practitioner actually builds what they're
 * selling: which sequences the reading includes, and the per-gate
 * interpretive text a client sees ("where do they go to modify this
 * information," her explicit ask 2026-08-05). Every gate ships with real
 * default content so this is usable immediately; fully rewritable.
 */
export function EnergeticDecoderReportsTab() {
  const { subAccountId, subAccount, isAdmin } = useSubAccount();
  const [config, setConfig] = useState<EnergeticDecoderReportConfig>(
    subAccount?.energeticDecoderReportConfig ?? defaultEnergeticDecoderReportConfig(),
  );
  const [savingConfig, setSavingConfig] = useState(false);

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

  async function toggleSequence(key: keyof EnergeticDecoderReportConfig) {
    const next = { ...config, [key]: !config[key] };
    setConfig(next);
    setSavingConfig(true);
    try {
      const res = await fetch(`/api/sub-accounts/${subAccountId}/energetic-decoder/report-config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      if (!res.ok) throw new Error();
    } catch {
      setConfig(config); // revert on failure
      toast.error("Couldn't save that change.");
    } finally {
      setSavingConfig(false);
    }
  }

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
        <div className="mb-4 flex items-center justify-between gap-3">
          <h3 className="text-base font-semibold">Gene Keys Reading</h3>
          <span className="rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
            Live
          </span>
        </div>

        <div className="mb-1 space-y-2">
          {SEQUENCES.map((seq) => (
            <label
              key={seq.key}
              className="flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 text-sm"
            >
              <input
                type="checkbox"
                checked={config[seq.key]}
                onChange={() => isAdmin && toggleSequence(seq.key)}
                disabled={!isAdmin || savingConfig}
                className="h-4 w-4 shrink-0"
              />
              <span className="flex-1 font-medium">{seq.name}</span>
              <span className="text-xs text-muted-foreground">{seq.spheres}</span>
            </label>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border bg-card p-6">
        <header className="mb-4">
          <h3 className="text-base font-semibold">Gate content</h3>
          <p className="mt-0.5 text-sm text-muted-foreground">
            What each gate actually says in a reading. Ships with real
            default text — rewrite any gate in your own voice.
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
