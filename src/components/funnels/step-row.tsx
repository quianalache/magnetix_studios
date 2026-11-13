"use client";

import Link from "next/link";
import {
  AlertTriangle,
  ArrowDown,
  ArrowRight,
  ArrowUp,
  CopyPlus,
  FileText,
  MoreHorizontal,
  Pencil,
  Route,
  Settings2,
  ShoppingCart,
  SquarePen,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/system/status-pill";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { describeEdge, edgesFor, hasRouting, STEP_TYPE_LABELS, type FunnelIssue } from "@/lib/checkout/funnel-routing";
import type { FunnelStep } from "@/types/checkout";
import { pageEditorHref, STEP_ICONS, stepSettingsHref, type FunnelHubPayload } from "@/components/funnels/funnel-ui";

export type StepAction = "rename" | "page" | "routing" | "duplicate" | "up" | "down" | "remove";

/**
 * One step on the funnel hub: number, type, name, page, Offer (checkout),
 * where buyers go next, warnings for this step, and its actions. Route chips
 * on Upsell / Downsell steps open the same routing editor as the menu.
 */
export function StepRow({
  hub,
  step,
  index,
  subAccountId,
  isAdmin,
  busy,
  issues,
  onAction,
}: {
  hub: FunnelHubPayload;
  step: FunnelStep;
  index: number;
  subAccountId: string;
  isAdmin: boolean;
  busy: boolean;
  issues: FunnelIssue[];
  onAction: (action: StepAction, step: FunnelStep) => void;
}) {
  const Icon = STEP_ICONS[step.type];
  const page = step.pageId ? hub.pages.find((p) => p.id === step.pageId) : null;
  const edges = edgesFor(hub.steps, index, hub.checkout[step.id]?.postPurchase);
  const first = index === 0;
  const last = index === hub.steps.length - 1;
  const settingsHref = stepSettingsHref(subAccountId, hub.funnel.id, step.id);

  const edgeLabel = (key: string) => (key === "accept" ? "If accepted" : key === "decline" ? "If declined" : key === "after_purchase" ? "After purchase" : "Then");

  return (
    <li className="flex gap-3 rounded-card border border-border bg-card p-3 shadow-card sm:p-4" data-step-row={step.id} data-step-name={step.name}>
      <div className="flex flex-col items-center gap-2">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent text-body-sm font-semibold text-accent-foreground tabular-nums">{index + 1}</span>
        <span className="flex size-8 items-center justify-center rounded-lg bg-tint-violet text-primary" aria-hidden="true">
          <Icon className="size-4" />
        </span>
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate text-body font-semibold">{step.name}</p>
            <p className="text-caption text-muted-foreground">{STEP_TYPE_LABELS[step.type]}</p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {page && step.type !== "checkout" ? (
              <Button variant="secondary" size="sm" className="hidden sm:inline-flex" render={<Link href={pageEditorHref(subAccountId, page.id)} />}>
                <SquarePen aria-hidden="true" /> Edit page
              </Button>
            ) : null}
            {step.type === "checkout" ? (
              <Button variant="secondary" size="sm" className="hidden sm:inline-flex" render={<Link href={settingsHref} />}>
                <Settings2 aria-hidden="true" /> Checkout settings
              </Button>
            ) : null}
            {isAdmin ? (
              <DropdownMenu>
                <DropdownMenuTrigger
                  render={
                    <button
                      type="button"
                      aria-label={`Actions for step ${index + 1}, ${step.name}`}
                      disabled={busy}
                      className="flex size-8 items-center justify-center rounded-md border border-border bg-card text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50 data-popup-open:bg-muted"
                    >
                      <MoreHorizontal className="size-4" aria-hidden="true" />
                    </button>
                  }
                />
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuItem render={<Link href={settingsHref} />}>
                    {step.type === "checkout" ? <ShoppingCart aria-hidden="true" /> : <Settings2 aria-hidden="true" />}
                    {step.type === "checkout" ? "Checkout settings" : "Edit step"}
                  </DropdownMenuItem>
                  {page ? (
                    <DropdownMenuItem render={<Link href={pageEditorHref(subAccountId, page.id)} />}>
                      <SquarePen aria-hidden="true" /> Edit page
                    </DropdownMenuItem>
                  ) : null}
                  <DropdownMenuItem onClick={() => onAction("page", step)}>
                    <FileText aria-hidden="true" /> {step.type === "checkout" ? "Checkout page…" : step.pageId ? "Change page…" : "Choose page…"}
                  </DropdownMenuItem>
                  {hasRouting(step.type) ? (
                    <DropdownMenuItem onClick={() => onAction("routing", step)}>
                      <Route aria-hidden="true" /> Routing…
                    </DropdownMenuItem>
                  ) : null}
                  <DropdownMenuItem onClick={() => onAction("rename", step)}>
                    <Pencil aria-hidden="true" /> Rename step
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onAction("duplicate", step)}>
                    <CopyPlus aria-hidden="true" /> Duplicate step…
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem disabled={first} onClick={() => onAction("up", step)}>
                    <ArrowUp aria-hidden="true" /> Move up
                  </DropdownMenuItem>
                  <DropdownMenuItem disabled={last} onClick={() => onAction("down", step)}>
                    <ArrowDown aria-hidden="true" /> Move down
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem variant="destructive" onClick={() => onAction("remove", step)}>
                    <Trash2 aria-hidden="true" /> Remove step
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
          </div>
        </div>

        {/* Page + Offer */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-body-sm">
          {step.type === "checkout" ? (
            <>
              <span className="text-muted-foreground">
                Offer: <span className="text-foreground">{hub.checkout[step.id]?.offerTitle ?? "not chosen yet"}</span>
              </span>
              <span className="text-muted-foreground">
                Page: <span className="text-foreground">{page ? page.name : step.pageId ? "missing page" : "Hosted checkout page"}</span>
              </span>
            </>
          ) : page ? (
            <span className="flex min-w-0 items-center gap-2">
              <Link href={pageEditorHref(subAccountId, page.id)} className="truncate font-medium hover:underline">
                {page.name}
              </Link>
              <StatusPill status={page.status}>{page.status === "published" ? "Published" : "Draft"}</StatusPill>
            </span>
          ) : (
            <span className="text-muted-foreground">{step.pageId ? "Its page was deleted" : "No page yet"}</span>
          )}
        </div>

        {/* Where buyers go next */}
        <div className="flex flex-wrap gap-1.5">
          {edges.map((e) => {
            const broken = e.target === "missing";
            const chip = (
              <>
                <span className="text-muted-foreground">{edgeLabel(e.key)}</span>
                <ArrowRight className="size-3.5 shrink-0 opacity-60" aria-hidden="true" />
                <span className="truncate">{describeEdge(hub.steps, e)}</span>
              </>
            );
            const cls = cn(
              "inline-flex max-w-full items-center gap-1.5 rounded-md border px-2 py-1 text-caption",
              broken ? "border-transparent bg-status-danger-bg text-status-danger-fg" : "border-border bg-background",
            );
            if (isAdmin && hasRouting(step.type)) {
              return (
                <button key={e.key} type="button" onClick={() => onAction("routing", step)} className={cn(cls, "outline-none hover:border-primary/40 focus-visible:ring-3 focus-visible:ring-ring/50")} data-route-chip={e.key}>
                  {chip}
                </button>
              );
            }
            if (isAdmin && step.type === "checkout") {
              return (
                <Link key={e.key} href={settingsHref} className={cn(cls, "hover:border-primary/40")} data-route-chip={e.key}>
                  {chip}
                </Link>
              );
            }
            return (
              <span key={e.key} className={cls} data-route-chip={e.key}>
                {chip}
              </span>
            );
          })}
        </div>

        {issues.length ? (
          <ul className="flex flex-col gap-1">
            {issues.map((i, n) => (
              <li key={n} className={cn("flex items-start gap-1.5 text-caption", i.level === "error" ? "text-status-danger-fg" : "text-status-warning-fg")}>
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                {i.message.replace(/^Step \d+ · [^:]+: /, "")}
              </li>
            ))}
          </ul>
        ) : null}

        {/* Phone: primary links (desktop shows them as buttons above) */}
        <div className="flex flex-wrap gap-2 sm:hidden">
          {page && step.type !== "checkout" ? (
            <Button variant="secondary" size="sm" render={<Link href={pageEditorHref(subAccountId, page.id)} />}>
              <SquarePen aria-hidden="true" /> Edit page
            </Button>
          ) : null}
          {step.type === "checkout" ? (
            <Button variant="secondary" size="sm" render={<Link href={settingsHref} />}>
              <Settings2 aria-hidden="true" /> Checkout settings
            </Button>
          ) : null}
        </div>
      </div>
    </li>
  );
}
