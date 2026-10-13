/**
 * Motif foundation checks (design-system Phase 0). Static render, no browser.
 * Run: pnpm exec tsx --tsconfig scripts/tsconfig.jsx-test.json scripts/check-motifs.tsx
 */
import { renderToStaticMarkup } from "react-dom/server";
import { Motif, MotifFrame, MOTIF_FOR, type MotifKind } from "../src/components/brand/motif";

const KINDS: MotifKind[] = ["planet", "crescent", "orbit", "constellation", "geometry", "glow", "clouds", "sparks"];
let pass = 0;
let fail = 0;
function check(label: string, ok: boolean) {
  if (ok) pass++;
  else fail++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}`);
}

for (const kind of KINDS) {
  const html = renderToStaticMarkup(<Motif kind={kind} />);
  check(`${kind}: decorative (aria-hidden, no pointer events)`, html.startsWith('<span aria-hidden="true"') && html.includes("pointer-events-none"));
  check(`${kind}: renders artwork`, /<svg|style="[^"]*background/.test(html));
  check(`${kind}: no raw hex colors (tokens only)`, !/#[0-9a-fA-F]{6}\b/.test(html));
}
check("absolute placement is the default (needs a positioned frame)", renderToStaticMarkup(<Motif kind="crescent" />).includes("absolute"));
check("MotifFrame is positioned and clips", /relative[^"]*overflow-hidden/.test(renderToStaticMarkup(<MotifFrame>x</MotifFrame>)));
check("hideBelow hides on small screens", renderToStaticMarkup(<Motif kind="glow" hideBelow="sm" />).includes("max-sm:hidden"));
check("animation is opt-in and motion-safe only", !renderToStaticMarkup(<Motif kind="glow" />).includes("animate") && renderToStaticMarkup(<Motif kind="glow" animate />).includes("motion-safe:"));
check("registry maps page families to the approved motifs", MOTIF_FOR.dashboard === "planet" && MOTIF_FOR.energeticDecoder === "constellation" && MOTIF_FOR.empty === "sparks");

console.log(`\n${pass} passed, ${fail} failed.`);
process.exit(fail ? 1 : 0);
