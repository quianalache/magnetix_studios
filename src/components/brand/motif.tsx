"use client";

import { useEffect, type CSSProperties, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Magnetix decorative motifs (design-system Phase 0, 2026-10-13).
 *
 * The approved Visual Direction 2 uses a FAMILY of celestial motifs — never the
 * same planet everywhere. Each page area owns at most one, and dense
 * operational pages (records, settings, inbox, pipeline, builders) use none.
 *
 *   planet        Dashboard hero only
 *   crescent      index pages (Assets, Content Library) — small, header corner
 *   orbit         progress / projects / pipeline reporting moments
 *   constellation Energetic Decoder (readings, charts, content sets)
 *   geometry      editorial: report covers, Decoder section breaks
 *   glow          AI experiences (AI Agents, Workspace Assistant)
 *   clouds        public / login / onboarding washes (tenant pages: tinted from their brand)
 *   sparks        empty states and success moments
 *
 * Rules baked in: decoration only (always aria-hidden, no pointer events, never
 * carries meaning); must sit inside a positioned frame (<MotifFrame> or any
 * `relative` parent) so it can never escape into the page and inflate the
 * document; fixed size presets; static unless `animate` (and then only under
 * prefers-reduced-motion: no-preference). Not placed on any live page in Phase 0.
 */

export type MotifKind = "planet" | "crescent" | "orbit" | "constellation" | "geometry" | "glow" | "clouds" | "sparks";
export type MotifSize = "hero" | "header" | "corner" | "inline";
export type MotifPlacement = "top-right" | "top-left" | "bottom-right" | "bottom-left" | "center" | "static";

/** Where each motif belongs — the registry future pages pick from instead of inventing art. */
export const MOTIF_FOR: Record<string, MotifKind> = {
  dashboard: "planet",
  index: "crescent",
  projects: "orbit",
  energeticDecoder: "constellation",
  editorial: "geometry",
  ai: "glow",
  public: "clouds",
  empty: "sparks",
};

const SIZE_PX: Record<MotifSize, number> = { hero: 160, header: 64, corner: 40, inline: 96 };

const PLACEMENT: Record<MotifPlacement, string> = {
  "top-right": "absolute right-4 top-4",
  "top-left": "absolute left-4 top-4",
  "bottom-right": "absolute bottom-4 right-4",
  "bottom-left": "absolute bottom-4 left-4",
  center: "absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2",
  static: "relative inline-block",
};

const GOLD = "var(--color-gold-300)";
const LAVENDER = "var(--color-violet-ds-300)";
const PLUM = "var(--color-plum-500)";
const BLUSH = "var(--color-blush-200)";
const SPARK_PATH = "M12 2C12.6 8.5 15.5 11.4 22 12 15.5 12.6 12.6 15.5 12 22 11.4 15.5 8.5 12.6 2 12 8.5 11.4 11.4 8.5 12 2Z";

let mountedMotifs = 0;

/** A positioned, clipped frame — the safe parent for any absolutely placed motif. */
export function MotifFrame({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn("relative isolate overflow-hidden", className)}>{children}</div>;
}

export function Motif({
  kind,
  size = "header",
  placement = "top-right",
  hideBelow,
  animate = false,
  className,
}: {
  kind: MotifKind;
  size?: MotifSize;
  placement?: MotifPlacement;
  /** Hide on narrow screens where the motif would crowd content. */
  hideBelow?: "sm" | "md";
  /** Gentle float, only for users who haven't asked for reduced motion. */
  animate?: boolean;
  className?: string;
}) {
  useEffect(() => {
    mountedMotifs += 1;
    if (process.env.NODE_ENV !== "production" && mountedMotifs > 1) {
      console.warn("[Motif] More than one motif is mounted — the design system allows one motif per page.");
    }
    return () => {
      mountedMotifs -= 1;
    };
  }, []);

  const px = SIZE_PX[size];
  const style: CSSProperties = { width: px, height: px };
  return (
    <span
      aria-hidden="true"
      data-motif={kind}
      style={style}
      className={cn(
        "pointer-events-none z-0 select-none",
        PLACEMENT[placement],
        hideBelow === "sm" && "max-sm:hidden",
        hideBelow === "md" && "max-md:hidden",
        animate && "motion-safe:animate-[pulse_6s_ease-in-out_infinite]",
        className,
      )}
    >
      {renderMotif(kind)}
    </span>
  );
}

function renderMotif(kind: MotifKind): ReactNode {
  switch (kind) {
    case "planet":
      return (
        <svg viewBox="0 0 100 100" className="h-full w-full overflow-visible">
          <defs>
            <radialGradient id="mx-motif-planet" cx="35%" cy="30%" r="75%">
              <stop offset="0%" stopColor="white" />
              <stop offset="45%" stopColor={LAVENDER} />
              <stop offset="100%" stopColor={PLUM} stopOpacity="0.7" />
            </radialGradient>
          </defs>
          <circle cx="50" cy="50" r="30" fill="url(#mx-motif-planet)" />
          <ellipse cx="50" cy="54" rx="48" ry="11" fill="none" stroke={GOLD} strokeWidth="1.5" transform="rotate(-16 50 54)" />
          <path d={SPARK_PATH} fill={GOLD} transform="translate(80 4) scale(0.6)" />
        </svg>
      );
    case "crescent":
      return (
        <svg viewBox="0 0 54 54" className="h-full w-full">
          <path d="M38 6A22 22 0 1 0 48 40 18 18 0 1 1 38 6Z" fill={GOLD} fillOpacity="0.55" />
          <path d={SPARK_PATH} fill={GOLD} transform="translate(2 2) scale(0.45)" />
        </svg>
      );
    case "orbit":
      return (
        <svg viewBox="0 0 100 100" className="h-full w-full">
          <g fill="none" stroke={LAVENDER} strokeWidth="0.8">
            <ellipse cx="50" cy="50" rx="20" ry="14" />
            <ellipse cx="50" cy="50" rx="34" ry="24" />
            <ellipse cx="50" cy="50" rx="48" ry="33" strokeOpacity="0.5" />
          </g>
          <circle cx="50" cy="50" r="5" fill={LAVENDER} />
          <circle cx="70" cy="50" r="2.5" fill={GOLD} />
          <circle cx="27" cy="38" r="2" fill={BLUSH} />
        </svg>
      );
    case "constellation":
      return (
        <svg viewBox="0 0 100 60" className="h-full w-full">
          <path d="M10 45L33 27L54 34L73 14L90 22M54 34L62 52" fill="none" stroke={LAVENDER} strokeWidth="0.8" />
          <g fill={PLUM}>
            <circle cx="10" cy="45" r="1.6" />
            <circle cx="33" cy="27" r="1.9" />
            <circle cx="54" cy="34" r="1.6" />
            <circle cx="62" cy="52" r="1.3" />
            <circle cx="90" cy="22" r="1.6" />
          </g>
          <circle cx="73" cy="14" r="2.8" fill={GOLD} />
        </svg>
      );
    case "geometry":
      return (
        <svg viewBox="0 0 100 100" className="h-full w-full">
          <g fill="none" stroke={GOLD} strokeOpacity="0.55" strokeWidth="0.8">
            {[[50, 50], [71, 50], [29, 50], [60.5, 31.8], [39.5, 31.8], [60.5, 68.2], [39.5, 68.2]].map(([cx, cy]) => (
              <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="21" />
            ))}
            <circle cx="50" cy="50" r="44" stroke={LAVENDER} />
          </g>
        </svg>
      );
    case "glow":
      return (
        <span
          className="block h-full w-full rounded-full"
          style={{ background: `radial-gradient(circle, ${LAVENDER} 0%, color-mix(in srgb, ${BLUSH} 45%, transparent) 45%, transparent 72%)` }}
        />
      );
    case "clouds":
      return (
        <span className="relative block h-full w-full">
          <span className="absolute -right-1/4 -top-1/4 h-3/4 w-full rounded-full blur-2xl" style={{ background: "var(--color-violet-ds-100)" }} />
          <span className="absolute -bottom-1/4 -left-1/4 h-2/3 w-3/4 rounded-full blur-2xl" style={{ background: "var(--color-blush-200)", opacity: 0.6 }} />
        </span>
      );
    case "sparks":
      return (
        <svg viewBox="0 0 48 48" className="h-full w-full">
          <path d={SPARK_PATH} fill={GOLD} transform="translate(12 12) scale(1)" />
          <path d={SPARK_PATH} fill={LAVENDER} transform="translate(32 4) scale(0.45)" />
          <path d={SPARK_PATH} fill={BLUSH} transform="translate(4 32) scale(0.35)" />
        </svg>
      );
  }
}
