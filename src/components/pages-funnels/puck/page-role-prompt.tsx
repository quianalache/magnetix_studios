"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { ExternalLink, Info, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Page-first funnels (2026-11-17): the page's ROLE in a funnel is configured
 * from inside the page. Shown in the Checkout block's settings and under the
 * Accept / Decline offer button actions. For each funnel step showing this
 * page it explains what the page does there and — for an ordinary page step
 * in a draft funnel — offers the explicit, server-checked change:
 *   checkout → "Take payments on this page" (the step gets its own checkout)
 *   offer    → "Use as a one-click offer page" (Offer + routes in Step settings)
 * Nothing here charges anyone; Offer, price and routing stay in the funnel's
 * stored step settings.
 */

interface PageStepRef {
  funnelId: string;
  funnelName: string;
  funnelStatus: string;
  stepId: string;
  stepName: string;
  stepType: string;
}

const isPlain = (t: string) => t === "page" || t === "thank_you";
const isOffer = (t: string) => t === "upsell" || t === "downsell";
const stepHref = (sa: string, s: PageStepRef) => `/sa/${sa}/pages-funnels/funnels/${s.funnelId}/steps/${s.stepId}`;
const hubHref = (sa: string, s: PageStepRef) => `/sa/${sa}/pages-funnels/funnels/${s.funnelId}`;

export function PageRolePrompt({ pageId, role, onChanged }: { pageId: string | undefined; role: "checkout" | "offer"; onChanged?: () => void }) {
  const [data, setData] = useState<{ subAccountId: string; pageSteps: PageStepRef[] } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    if (!pageId) return;
    let cancelled = false;
    fetch(`/api/pages-funnels/puck/resolve-checkout?pageId=${encodeURIComponent(pageId)}&keys=`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d: { subAccountId: string; pageSteps?: PageStepRef[] }) => !cancelled && setData({ subAccountId: d.subAccountId, pageSteps: d.pageSteps ?? [] }))
      .catch(() => !cancelled && setData(null));
    return () => {
      cancelled = true;
    };
  }, [pageId, reload]);

  const apply = useCallback(
    async (s: PageStepRef) => {
      if (!data || busy) return;
      setBusy(s.stepId);
      try {
        const res = await fetch(`/api/sub-accounts/${data.subAccountId}/commerce/funnels/${s.funnelId}/steps/${s.stepId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ role }),
        });
        const json = (await res.json().catch(() => ({}))) as { notes?: string[]; error?: string };
        if (!res.ok) throw new Error(json.error ?? "Couldn't update the funnel. Try again.");
        toast.success(role === "checkout" ? `Buyers can now pay on this page in “${s.funnelName}”.` : `This page is now a one-click offer page in “${s.funnelName}”.`, {
          description: json.notes?.join(" ") || undefined,
          duration: 10_000,
          action: role === "offer" ? { label: "Step settings", onClick: () => window.open(stepHref(data.subAccountId, s), "_blank", "noopener") } : undefined,
        });
        setReload((n) => n + 1);
        onChanged?.();
      } catch (err) {
        toast.error((err as Error).message);
      } finally {
        setBusy(null);
      }
    },
    [data, busy, role, onChanged],
  );

  if (!pageId || !data) return null;
  if (data.pageSteps.length === 0) {
    return role === "offer" ? (
      <Note>Add this page to a funnel, after the page where buyers check out, to use Accept offer and Decline offer.</Note>
    ) : null;
  }

  return (
    <div className="space-y-2" data-page-role-prompt={role}>
      {data.pageSteps.map((s) => {
        const live = s.funnelStatus === "published";
        if (role === "offer") {
          if (isOffer(s.stepType)) {
            return (
              <Note key={s.stepId}>
                One-click offer page in <strong>{s.funnelName}</strong>. The Offer, price and where buyers go next are set in{" "}
                <a href={stepHref(data.subAccountId, s)} target="_blank" rel="noreferrer" className="text-link inline-flex items-center gap-0.5 font-medium underline-offset-2 hover:underline">
                  Step settings <ExternalLink className="size-3" aria-hidden="true" />
                </a>
                .
              </Note>
            );
          }
          if (s.stepType === "checkout") {
            return (
              <Note key={s.stepId}>
                Buyers check out on this page in <strong>{s.funnelName}</strong>. Accept and Decline work on the offer pages shown after checkout.
              </Note>
            );
          }
        } else if (!isPlain(s.stepType)) {
          return null;
        }
        if (!isPlain(s.stepType)) return null;
        return (
          <div key={s.stepId} className="border-primary/30 bg-primary/5 space-y-2 rounded-lg border p-2.5 text-xs" data-page-role-step={s.stepId}>
            <p className="flex items-start gap-1.5">
              <Info className="text-primary mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
              <span>
                {role === "checkout" ? (
                  <>
                    In <strong>{s.funnelName}</strong> this page isn&apos;t set up as a checkout page yet.
                  </>
                ) : (
                  <>
                    In <strong>{s.funnelName}</strong> this is an ordinary page, so these buttons don&apos;t do anything yet.
                  </>
                )}
              </span>
            </p>
            {live ? (
              <p className="text-muted-foreground ps-5">
                That funnel is live.{" "}
                <a href={hubHref(data.subAccountId, s)} target="_blank" rel="noreferrer" className="text-link font-medium underline-offset-2 hover:underline">
                  Unpublish it
                </a>{" "}
                to change what this page does.
              </p>
            ) : (
              <Button type="button" size="sm" variant="secondary" className="w-full" disabled={!!busy} onClick={() => void apply(s)} data-page-role-apply={role}>
                {busy === s.stepId ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
                {role === "checkout" ? "Take payments on this page" : "Use as a one-click offer page"}
              </Button>
            )}
          </div>
        );
      })}
    </div>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-muted-foreground flex items-start gap-1.5 rounded-md border border-dashed p-2.5 text-xs" role="status">
      <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
      <span>{children}</span>
    </p>
  );
}
