/**
 * Small, pure presentation helpers shared between MyMagnetix's Server and
 * Client Components (no "server-only"/"use client" — safe either side).
 * Used to give Space/Course cards an attractive gradient banner when there
 * is no real cover image to show, deterministic per id so the same
 * business/course always renders the same color, not random per request.
 */

const GRADIENT_PAIRS: Array<[string, string]> = [
  ["#F472B6", "#A855F7"], // pink -> purple
  ["#8B5CF6", "#4C1D95"], // violet -> deep purple
  ["#F59E0B", "#D97706"], // amber -> orange
  ["#2DD4BF", "#0F766E"], // teal -> deep teal
  ["#60A5FA", "#4338CA"], // blue -> indigo
  ["#FB7185", "#BE123C"], // rose -> deep rose
];

function hashString(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 31 + input.charCodeAt(i)) >>> 0;
  }
  return hash;
}

export function gradientForId(id: string): string {
  const [from, to] = GRADIENT_PAIRS[hashString(id) % GRADIENT_PAIRS.length];
  return `linear-gradient(135deg, ${from}, ${to})`;
}

export function initialsFor(name: string): string {
  return (name.trim()[0] ?? "?").toUpperCase();
}
