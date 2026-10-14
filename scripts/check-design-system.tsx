/**
 * Shared design-system component checks (design-system Phase 1). Static
 * render, no browser, no data.
 * Run: pnpm exec tsx --tsconfig scripts/tsconfig.jsx-test.json scripts/check-design-system.tsx
 */
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { buttonVariants } from "../src/components/ui/button";
import { PageShell } from "../src/components/system/page-shell";
import { PageHeader } from "../src/components/system/page-header";
import { STATUS_TONE, StatusPill, Tag, tagColorFor } from "../src/components/system/status-pill";
import { pageWindow } from "../src/components/system/pagination";
import { EmptyState } from "../src/components/system/empty-state";
import { Alert } from "../src/components/ui/alert";

let pass = 0;
let fail = 0;
function check(label: string, ok: boolean) {
  if (ok) pass++;
  else fail++;
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}`);
}
const html = (el: React.ReactElement) => renderToStaticMarkup(el);

// Buttons — approved heights and colors.
check("Button default = 38px control", buttonVariants().includes("h-(--ds-control-md)"));
check("Button sm = 32px control", buttonVariants({ size: "sm" }).includes("h-(--ds-control-sm)"));
check("Button lg and touch = 44px", buttonVariants({ size: "lg" }).includes("h-(--ds-control-lg)") && buttonVariants({ size: "touch" }).includes("h-(--ds-control-lg)"));
check("Button primary uses --primary (deep plum in the CRM scope)", buttonVariants().includes("bg-primary"));
check("Button secondary is white-with-border, not a tinted fill", buttonVariants({ variant: "secondary" }).includes("border-input") && !buttonVariants({ variant: "secondary" }).includes("bg-secondary"));
check("Icon-only button sizes unchanged (builder toolbars)", buttonVariants({ size: "icon" }).includes("size-8"));

// PageShell widths.
for (const [w, cls] of [["form", "max-w-page-form"], ["data", "max-w-page-data"], ["wide", "max-w-page-wide"], ["full", "max-w-none"]] as const) {
  check(`PageShell width=${w} → ${cls}`, html(<PageShell width={w}>x</PageShell>).includes(cls));
}

// PageHeader modes.
const op = html(<PageHeader title="Settings" />);
const mo = html(<PageHeader variant="moment" motif="constellation" title="Content Sets" />);
check("operational header: one h1, system sans, no display serif", (op.match(/<h1/g) ?? []).length === 1 && !op.includes("font-display") && op.includes("text-title-lg"));
check("operational header has no motif", !op.includes("data-motif"));
check("moment header: DM Serif Display + motif", mo.includes("font-display") && mo.includes('data-motif="constellation"'));
check("moment header frame is positioned (motif can't escape)", /<header[^>]*class="[^"]*relative/.test(mo));

// StatusPill vs Tag.
check("StatusPill maps common states", STATUS_TONE.active === "success" && STATUS_TONE.draft === "warning" && STATUS_TONE.failed === "danger" && STATUS_TONE.scheduled === "scheduled");
check("StatusPill has a dot and semantic colors", html(<StatusPill status="active">Active</StatusPill>).includes("before:size-1.5") && html(<StatusPill status="active">Active</StatusPill>).includes("bg-status-success-bg"));
check("unknown status falls back to neutral", html(<StatusPill>Whatever</StatusPill>).includes('data-status-tone="neutral"'));
check("Tag has no dot and uses tag (not status) colors", !html(<Tag>Guide</Tag>).includes("before:") && /bg-tag-\w+-bg/.test(html(<Tag>Guide</Tag>)) && !html(<Tag>Guide</Tag>).includes("status"));
check("Tag color is stable per label", tagColorFor("Branding") === tagColorFor(" branding "));
check("Tag colors rotate across labels", new Set(["Guide", "Branding", "Podcast", "Launches", "Checklist", "Operations", "Design asset"].map(tagColorFor)).size >= 3);

// Pagination window.
check("pagination: small counts list every page", JSON.stringify(pageWindow(1, 5)) === "[1,2,3,4,5]");
check("pagination: large counts show first/last/±1 with gaps", JSON.stringify(pageWindow(6, 20)) === "[1,null,5,6,7,null,20]");

// Alert + EmptyState.
check("danger alert is announced (role=alert)", html(<Alert tone="danger" title="x" />).includes('role="alert"'));
check("info alert is polite (role=status)", html(<Alert tone="info" title="x" />).includes('role="status"'));
check("EmptyState sparks uses the motif, not raw art", html(<EmptyState sparks title="Done" />).includes('data-motif="sparks"'));

// ConfirmDialog is built on the AlertDialog primitive (no window.confirm inside).
const confirmSrc = readFileSync(new URL("../src/components/system/confirm-dialog.tsx", import.meta.url), "utf8");
check("ConfirmDialog uses AlertDialog, never window.confirm", confirmSrc.includes("@/components/ui/alert-dialog") && !/window\.confirm\(/.test(confirmSrc));

console.log(`\n${pass} passed, ${fail} failed.`);
process.exit(fail ? 1 : 0);
