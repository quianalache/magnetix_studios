/**
 * Small, pure presentation helpers shared between MyMagnetix's Server and
 * Client Components (no "server-only"/"use client" — safe either side).
 * Used to give Space/Course/Reading cards a consistent accent when there is
 * no real cover image, deterministic per id so the same item always renders
 * the same tone, not random per request.
 */

export type TileTone = "violet" | "pink" | "aqua" | "gold" | "blue";
const TONES: TileTone[] = ["violet", "pink", "aqua", "gold", "blue"];

function hashString(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 31 + input.charCodeAt(i)) >>> 0;
  }
  return hash;
}

/**
 * Visual Direction 2 accent for a cover tile without a real image —
 * deterministic per id, drawn from the tag palette so accents stay accents
 * (soft tint + icon), never a full-bleed gradient slab.
 */
export function toneForId(id: string): TileTone {
  return TONES[hashString(id) % TONES.length];
}

export function initialsFor(name: string): string {
  return (name.trim()[0] ?? "?").toUpperCase();
}
