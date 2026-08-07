"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useSubAccount } from "@/context/sub-account-context";
import {
  defaultEnergeticDecoderReportConfig,
  type EnergeticDecoderReportConfig,
} from "@/types/energetic-decoder";

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
 * Reports tab — assembly and delivery only: which sequences a reading
 * includes. The per-gate interpretive text used to live here too, moved
 * out to its own Content tab (2026-08-08) after auditing bodygraph.com's
 * real structure at her request: their Reports tool never stores gate
 * text directly either, it references a separate Chart Content library
 * via shortcodes at generation time. Same split here — this tab decides
 * WHAT'S INCLUDED, Content decides WHAT IT SAYS.
 */
export function EnergeticDecoderReportsTab() {
  const { subAccountId, subAccount, isAdmin } = useSubAccount();
  const [config, setConfig] = useState<EnergeticDecoderReportConfig>({
    ...defaultEnergeticDecoderReportConfig(),
    ...(subAccount?.energeticDecoderReportConfig ?? {}),
  });
  const [savingConfig, setSavingConfig] = useState(false);

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

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border bg-card p-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h3 className="text-base font-semibold">Gene Keys Reading</h3>
          <span className="rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
            Live
          </span>
        </div>
        <p className="mb-4 text-sm text-muted-foreground">
          Which sequences a reading includes when you sell it. Gate-by-gate wording lives under the
          Content tab — editing it there updates every sequence automatically.
        </p>

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
        <div className="mb-4 flex items-center justify-between gap-3">
          <h3 className="text-base font-semibold">Human Design Reading</h3>
          <span className="rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
            Live
          </span>
        </div>
        <p className="mb-4 text-sm text-muted-foreground">
          Type, Strategy, Authority, Profile, Definition, and every defined Center and Channel — a
          full bodygraph computed from the same birth data as the Gene Keys reading.
        </p>
        <label className="flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 text-sm">
          <input
            type="checkbox"
            checked={config.includeHumanDesign}
            onChange={() => isAdmin && toggleSequence("includeHumanDesign")}
            disabled={!isAdmin || savingConfig}
            className="h-4 w-4 shrink-0"
          />
          <span className="flex-1 font-medium">Include Human Design in new readings</span>
        </label>
      </div>
    </div>
  );
}
