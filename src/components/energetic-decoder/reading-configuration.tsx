"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useSubAccount } from "@/context/sub-account-context";
import {
  defaultEnergeticDecoderReportConfig,
  type EnergeticDecoderReportConfig,
} from "@/types/energetic-decoder";
import type { AstrologyHouseSystem } from "@/lib/energetics/reading-calculation-settings";

const HOUSE_SYSTEM_OPTIONS: { value: AstrologyHouseSystem; label: string }[] = [
  { value: "placidus", label: "Placidus" },
  { value: "whole", label: "Whole Sign" },
  { value: "equal", label: "Equal" },
];

/** The on/off parts of the reading configuration (everything except the house system). */
type InclusionKey = Exclude<keyof EnergeticDecoderReportConfig, "astrologyHouseSystem">;

const SEQUENCES: {
  key: InclusionKey;
  name: string;
  spheres: string;
}[] = [
  { key: "includeActivation", name: "Incarnation Sequence", spheres: "Life's Work · Evolution · Radiance · Purpose" },
  { key: "includeVenus", name: "Love Sequence", spheres: "Attraction · IQ · EQ · SQ" },
  { key: "includePearl", name: "Prosperity Sequence", spheres: "Vocation · Brand · Culture · Pearl" },
];

/**
 * Reading Configuration — formerly the standalone "Reports" tab, relocated
 * 2026-08-12 (Phase 2 Build Plan §6 / Decision Brief). It never showed or
 * generated a report; it's which systems get computed into a NEW reading —
 * a settings panel that collided in name with the real report-generation
 * system (Report Builder / Generated Reports). Now surfaced as a small
 * panel from the Readings tab, right where a practitioner is already
 * deciding what to compute for a client, instead of a misleading top-level
 * peer to Report Builder. Same component logic, same Firestore field
 * (`energeticDecoderReportConfig`), same API route — only the label,
 * location, and framing changed, per the approved plan's "relocate, don't
 * rebuild" recommendation.
 *
 * Assembly and delivery only: which sequences a reading includes. The
 * per-gate interpretive text used to live here too, moved out to its own
 * Content tab (2026-08-08) after auditing bodygraph.com's real structure at
 * her request: their Reports tool never stores gate text directly either,
 * it references a separate Chart Content library via shortcodes at
 * generation time. Same split here — this panel decides WHAT'S INCLUDED,
 * Content decides WHAT IT SAYS.
 *
 * Renamed 2026-08-09: "Gene Keys" is Richard Rudd's trademarked term.
 * Bodygraph's own real product avoids it too — their "Frequency Report"
 * is the exact same underlying system (verified: their own front-end code
 * literally calls it `edit-gene-key`/`openEditGeneKey` internally, they
 * just relabel it Incarnation/Love/Prosperity Sequences + Shadow/Gift/
 * Mastery for the public-facing product). Same rename here: user-facing
 * copy only — `includeActivation`/`includeVenus`/`includePearl` and the
 * underlying `gene-keys.ts` engine/types stay as they are internally,
 * since those aren't customer-visible and renaming them carries real
 * regression risk for zero trademark benefit.
 */
export function EnergeticDecoderReadingConfiguration() {
  const { subAccountId, subAccount, isAdmin } = useSubAccount();
  const [config, setConfig] = useState<EnergeticDecoderReportConfig>({
    ...defaultEnergeticDecoderReportConfig(),
    ...(subAccount?.energeticDecoderReportConfig ?? {}),
  });
  const [savingConfig, setSavingConfig] = useState(false);
  /** The house system new readings use right now (saved setting, or the previous rule until it's saved). */
  const [houseSystem, setHouseSystem] = useState<AstrologyHouseSystem | null>(null);

  useEffect(() => {
    if (!subAccountId) return;
    fetch(`/api/sub-accounts/${subAccountId}/energetic-decoder/report-config`)
      .then((r) => r.json())
      .then((d: { astrologyHouseSystem?: AstrologyHouseSystem }) => setHouseSystem(d.astrologyHouseSystem ?? "placidus"))
      .catch(() => setHouseSystem(null));
  }, [subAccountId]);

  async function changeHouseSystem(next: AstrologyHouseSystem) {
    const previous = houseSystem;
    setHouseSystem(next);
    setSavingConfig(true);
    try {
      const res = await fetch(`/api/sub-accounts/${subAccountId}/energetic-decoder/report-config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...config, astrologyHouseSystem: next }),
      });
      if (!res.ok) throw new Error();
      setConfig((c) => ({ ...c, astrologyHouseSystem: next }));
      toast.success("House system saved — applies to new readings.");
    } catch {
      setHouseSystem(previous);
      toast.error("Couldn't save the house system.");
    } finally {
      setSavingConfig(false);
    }
  }

  async function toggleSequence(key: InclusionKey) {
    const next = { ...config, [key]: !config[key] };
    setConfig(next);
    setSavingConfig(true);
    // Never re-send the house system from this (possibly stale) copy — the
    // server keeps the saved one when the request doesn't mention it.
    const { astrologyHouseSystem: _house, ...inclusions } = next;
    void _house;
    try {
      const res = await fetch(`/api/sub-accounts/${subAccountId}/energetic-decoder/report-config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(inclusions),
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
      <p className="text-sm text-muted-foreground">
        Which systems get computed and saved every time you create a new reading for this
        sub-account. This doesn&apos;t affect existing readings or how any report is designed —
        for that, see Report Builder.
      </p>

      <div className="rounded-2xl border bg-card p-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h3 className="text-base font-semibold">Frequency Reading</h3>
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
          full bodygraph computed from the same birth data as the Frequency reading.
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

      <div className="rounded-2xl border bg-card p-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h3 className="text-base font-semibold">Astrology Reading</h3>
          <span className="rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
            Live
          </span>
        </div>
        <p className="mb-4 text-sm text-muted-foreground">
          A full Western Tropical natal chart — Sun, Moon, Rising, every planet&apos;s sign and house,
          and the aspects between them.
        </p>
        <label className="flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 text-sm">
          <input
            type="checkbox"
            checked={config.includeAstrology}
            onChange={() => isAdmin && toggleSequence("includeAstrology")}
            disabled={!isAdmin || savingConfig}
            className="h-4 w-4 shrink-0"
          />
          <span className="flex-1 font-medium">Include Astrology in new readings</span>
        </label>
        <div className="mt-3 space-y-1.5 rounded-lg border px-3 py-2.5">
          <div className="flex items-center gap-3">
            <label htmlFor="ed-house-system" className="flex-1 text-sm font-medium">
              House system
            </label>
            <select
              id="ed-house-system"
              value={houseSystem ?? ""}
              onChange={(e) => isAdmin && void changeHouseSystem(e.target.value as AstrologyHouseSystem)}
              disabled={!isAdmin || savingConfig || houseSystem === null}
              className="h-8 rounded-md border bg-background px-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
            >
              {houseSystem === null && <option value="">Loading…</option>}
              {HOUSE_SYSTEM_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <p className="text-xs text-muted-foreground">
            How houses are calculated for new readings. Existing readings keep the house system they were calculated with.
            Chart Designs never change this.
          </p>
        </div>
      </div>
    </div>
  );
}
