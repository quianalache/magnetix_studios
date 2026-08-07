import type { GeneKeysSphereResult } from "@/lib/energetics/gene-keys";
import type { HumanDesignProfile } from "@/lib/energetics/human-design";
import { CENTERS, CENTER_LABELS } from "@/lib/energetics/human-design-data";
import { TYPE_CONTENT, AUTHORITY_CONTENT, CENTER_CONTENT } from "@/lib/energetics/human-design-content-data";
import type { AstrologyChart } from "@/lib/energetics/astrology";
import { ASPECT_TYPE_CONTENT } from "@/lib/energetics/astrology-content-data";
import type { HumanDesignReadingContent, AstrologyReadingContent } from "@/types/energetic-decoder";
import { HumanDesignChart } from "@/components/energetic-decoder/human-design-chart";
import { AstrologyWheelChart } from "@/components/energetic-decoder/astrology-wheel-chart";

/**
 * A saved reading's full display, for BOTH the admin Readings tab
 * (accordion row) and the public, shareable report page
 * (/decoder/[saId]/report/[readingId]) — extracted 2026-08-08 so the two
 * don't drift, and so the actual client-facing report isn't a second,
 * separately-maintained copy of this JSX.
 *
 * Every text field prefers the reading's own snapshotted `content` (the
 * sub-account's wording at generation time, or the default if they never
 * rewrote it — see energetic-decoder-chart-content-service.ts) and only
 * falls back to the hardcoded default maps for readings saved before that
 * snapshot existed.
 */

export function SphereList({ spheres }: { spheres: GeneKeysSphereResult[] }) {
  return (
    <div className="divide-y rounded-2xl border bg-card">
      {spheres.map((s) => (
        <div key={s.sphere} className="px-5 py-3">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{s.sphere}</p>
              <p className="text-sm font-semibold">
                Gene Key {s.gate}.{s.line}
              </p>
            </div>
            <p className="text-right text-xs text-muted-foreground">
              <span className="text-rose-500">{s.shadow}</span>
              {" → "}
              <span className="text-emerald-500">{s.gift}</span>
              {" → "}
              <span>☆ {s.siddhi}</span>
            </p>
          </div>
          {(s.showsUp || s.giftText) && (
            <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
              {s.showsUp} {s.giftText}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

export function HumanDesignSummary({
  profile,
}: {
  profile: HumanDesignProfile & { content?: HumanDesignReadingContent };
}) {
  const content = profile.content;
  const typeStrategy = content?.typeStrategy || TYPE_CONTENT[profile.type].strategy;
  const typeDescription = content?.typeDescription || TYPE_CONTENT[profile.type].description;
  const authorityDescription = content?.authorityDescription || AUTHORITY_CONTENT[profile.authority].description;
  const definedSet = new Set(profile.definedCenters);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border bg-card p-4">
        <p className="mb-2.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Bodygraph — Personality <span style={{ color: "#18181b" }}>black</span>, Design <span className="text-rose-600">red</span>
        </p>
        <HumanDesignChart profile={profile} className="mx-auto w-full max-w-[560px]" />
      </div>

      <div className="rounded-2xl border bg-card p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Human Design</p>
        <div className="mt-1.5 grid gap-3 sm:grid-cols-2">
          <div>
            <p className="text-sm font-semibold">{profile.type}</p>
            <p className="text-xs text-muted-foreground">Strategy: {typeStrategy}</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{typeDescription}</p>
          </div>
          <div>
            <p className="text-sm font-semibold">{profile.authority} Authority</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{authorityDescription}</p>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 border-t pt-3 text-xs text-muted-foreground">
          <span>
            Profile: <span className="font-medium text-foreground">{profile.profile ?? "—"}</span>
          </span>
          <span>
            Definition: <span className="font-medium text-foreground">{profile.definitionLabel}</span>
          </span>
          <span>
            Gates activated: <span className="font-medium text-foreground">{profile.activatedGates.length}</span>
          </span>
        </div>
      </div>

      <div className="rounded-2xl border bg-card p-4">
        <p className="mb-2.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">Centers</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {CENTERS.map((c) => {
            const defined = definedSet.has(c);
            const centerContent = content?.centers[c];
            const text = defined
              ? centerContent?.definedText || CENTER_CONTENT[c].definedText
              : centerContent?.undefinedText || CENTER_CONTENT[c].undefinedText;
            return (
              <div
                key={c}
                className={`rounded-lg border px-2.5 py-2 ${defined ? "border-primary/40 bg-primary/5" : ""}`}
              >
                <p className="flex items-center justify-between gap-1 text-xs font-semibold">
                  {CENTER_LABELS[c]}
                  <span
                    className={`h-2 w-2 shrink-0 rounded-full ${defined ? "bg-primary" : "bg-muted-foreground/30"}`}
                  />
                </p>
                <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{text}</p>
              </div>
            );
          })}
        </div>
      </div>

      {profile.definedChannels.length > 0 && (
        <div className="rounded-2xl border bg-card p-4">
          <p className="mb-2.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Defined Channels
          </p>
          <div className="flex flex-wrap gap-1.5">
            {profile.definedChannels.map((ch) => (
              <span key={ch.key} className="rounded-full border bg-muted/40 px-2.5 py-1 text-xs">
                {ch.gates[0]}-{ch.gates[1]}
                {ch.name ? ` · ${ch.name}` : ""}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function AstrologySummary({ chart }: { chart: AstrologyChart & { content?: AstrologyReadingContent } }) {
  const content = chart.content;
  const sun = chart.placements.find((p) => p.body === "sun");
  const moon = chart.placements.find((p) => p.body === "moon");

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border bg-card p-4">
        <p className="mb-2.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">Natal Chart</p>
        <AstrologyWheelChart chart={chart} className="mx-auto w-full max-w-[520px]" />
      </div>

      <div className="rounded-2xl border bg-card p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Astrology — Western Tropical, {chart.houses.system === "placidus" ? "Placidus" : "Whole Sign"} houses
        </p>
        <div className="mt-1.5 grid gap-3 sm:grid-cols-3">
          <div>
            <p className="text-[11px] text-muted-foreground">Sun</p>
            <p className="text-sm font-semibold">
              {sun?.sign} {sun?.degInSign.toFixed(1)}°
            </p>
          </div>
          <div>
            <p className="text-[11px] text-muted-foreground">Moon</p>
            <p className="text-sm font-semibold">
              {moon?.sign} {moon?.degInSign.toFixed(1)}°
            </p>
          </div>
          <div>
            <p className="text-[11px] text-muted-foreground">Rising (Ascendant)</p>
            <p className="text-sm font-semibold">
              {chart.angles.ascendant.sign} {chart.angles.ascendant.degInSign.toFixed(1)}°
            </p>
          </div>
        </div>
        {chart.houses.fallbackReason && (
          <p className="mt-2 text-[11px] italic text-muted-foreground">{chart.houses.fallbackReason}</p>
        )}
      </div>

      <div className="rounded-2xl border bg-card p-4">
        <p className="mb-2.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">Placements</p>
        <div className="divide-y">
          {chart.placements.map((p) => {
            const signText = content?.signs[p.sign];
            return (
              <div key={p.body} className="py-1.5">
                <div className="flex items-center justify-between gap-3 text-xs">
                  <span className="w-16 shrink-0 font-medium capitalize">{p.body}</span>
                  <span className="flex-1">
                    {p.sign} {p.degInSign.toFixed(1)}°{p.retrograde ? " ℞" : ""}
                  </span>
                  <span className="text-muted-foreground">House {p.house}</span>
                </div>
                {signText && <p className="mt-0.5 pl-[76px] text-[11px] leading-snug text-muted-foreground">{signText}</p>}
              </div>
            );
          })}
        </div>
      </div>

      {chart.aspects.length > 0 && (
        <div className="rounded-2xl border bg-card p-4">
          <p className="mb-2.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Aspects ({chart.aspects.length})
          </p>
          <div className="space-y-1.5">
            {chart.aspects.slice(0, 12).map((a, i) => (
              <div key={i} className="text-xs">
                <span className="font-medium capitalize">{a.bodyA}</span> {a.type.toLowerCase()}{" "}
                <span className="font-medium capitalize">{a.bodyB}</span>
                <span className="text-muted-foreground">
                  {" "}
                  ({a.orb.toFixed(1)}° from exact) — {content?.aspectTypes[a.type] || ASPECT_TYPE_CONTENT[a.type]}
                </span>
              </div>
            ))}
            {chart.aspects.length > 12 && (
              <p className="pt-1 text-[11px] italic text-muted-foreground">
                +{chart.aspects.length - 12} more aspects
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
