/**
 * cn() / tailwind-merge knows the Magnetix design-system scales (design-system
 * Phase 1). Without this, `text-caption` is mistaken for a text COLOR and
 * dropped when a color class follows. Run: pnpm exec tsx scripts/check-cn-merge.ts
 */
import { cn } from "../src/lib/utils";

const cases: [string, string, string][] = [
  ["type scale survives a color class", cn("text-caption", "text-status-success-fg"), "text-caption text-status-success-fg"],
  ["type scale overrides a stock size", cn("text-sm", "text-caption"), "text-caption"],
  ["display scale survives a color class", cn("text-title-lg font-semibold", "text-ink-primary"), "text-title-lg font-semibold text-ink-primary"],
  ["custom shadows merge", cn("shadow-card", "shadow-pop"), "shadow-pop"],
  ["custom radii merge", cn("rounded-xl", "rounded-card"), "rounded-card"],
  ["stock color merge unchanged", cn("text-red-500", "text-foreground"), "text-foreground"],
];
let fail = 0;
for (const [label, got, want] of cases) {
  const ok = got === want;
  if (!ok) fail++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${ok ? "" : ` — got "${got}", want "${want}"`}`);
}
console.log(`\n${cases.length - fail} passed, ${fail} failed.`);
process.exit(fail ? 1 : 0);
