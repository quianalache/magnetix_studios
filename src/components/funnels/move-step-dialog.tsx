"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, Ban, FolderInput, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { OptionSelect } from "@/components/system/option-select";
import { commerceFetch } from "@/lib/client/commerce-api";
import type { Funnel, FunnelStep } from "@/types/checkout";
import type { FunnelHubPayload } from "@/components/funnels/funnel-ui";

interface MovePreview {
  sourceFunnelName: string;
  targetFunnelName: string;
  pageName: string;
  blockers: string[];
  warnings: string[];
}

/**
 * Move a page to another funnel (page-first funnels, 2026-11-17). Moving keeps
 * the page itself (same page, same URL) — it is never copied. The server
 * previews first: anything that would break a payment or route is listed and
 * blocks the move; consequences the creator must accept are listed and need
 * an explicit "Move page". Nothing changes until then.
 */
export function MoveStepDialog({
  open,
  onOpenChange,
  subAccountId,
  hub,
  step,
  onDone,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  subAccountId: string;
  hub: FunnelHubPayload;
  step: FunnelStep | null;
  onDone: () => void;
}) {
  const router = useRouter();
  const [funnels, setFunnels] = useState<Array<Funnel & { stepCount: number }> | null>(null);
  const [target, setTarget] = useState<string | null>(null);
  const [preview, setPreview] = useState<MovePreview | null>(null);
  const [checking, setChecking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setTarget(null);
    setPreview(null);
    setError(null);
    setFunnels(null);
    commerceFetch<{ funnels: Array<Funnel & { stepCount: number }> }>(subAccountId, "funnels")
      .then((d) => setFunnels(d.funnels.filter((f) => f.id !== hub.funnel.id)))
      .catch((e) => setError((e as Error).message));
  }, [open, subAccountId, hub.funnel.id]);

  useEffect(() => {
    if (!open || !step || !target) return;
    let cancelled = false;
    setChecking(true);
    setPreview(null);
    setError(null);
    commerceFetch<{ preview: MovePreview }>(subAccountId, `funnels/${hub.funnel.id}/steps/${step.id}/move`, { method: "POST", body: { targetFunnelId: target } })
      .then((d) => !cancelled && setPreview(d.preview))
      .catch((e) => !cancelled && setError((e as Error).message))
      .finally(() => !cancelled && setChecking(false));
    return () => {
      cancelled = true;
    };
  }, [open, step, target, subAccountId, hub.funnel.id]);

  async function move() {
    if (!step || !target || !preview || preview.blockers.length || busy) return;
    setBusy(true);
    setError(null);
    try {
      await commerceFetch(subAccountId, `funnels/${hub.funnel.id}/steps/${step.id}/move`, { method: "POST", body: { targetFunnelId: target, confirm: true } });
      toast.success(`“${preview.pageName}” moved to “${preview.targetFunnelName}”.`, {
        description: "It's the same page — only the funnel it belongs to changed.",
        action: { label: "Open funnel", onClick: () => router.push(`/sa/${subAccountId}/pages-funnels/funnels/${target}`) },
      });
      onDone();
      onOpenChange(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const blocked = !!preview?.blockers.length;

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg" data-move-step-dialog>
        <DialogHeader>
          <DialogTitle>Move to another funnel</DialogTitle>
          <DialogDescription>
            Moves {step ? <strong>“{step.name}”</strong> : "this page"} to another funnel. It stays the same page; it isn&apos;t copied. To keep it in this funnel too, use Duplicate step instead.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="move-step-target">Move to</Label>
            {funnels && funnels.length === 0 ? (
              <p className="text-body-sm text-muted-foreground">There are no other funnels in this workspace yet.</p>
            ) : (
              <OptionSelect
                id="move-step-target"
                aria-label="Move to"
                value={target}
                onChange={setTarget}
                disabled={!funnels || busy}
                placeholder={funnels ? "Choose a funnel…" : "Loading funnels…"}
                options={(funnels ?? []).map((f) => ({ value: f.id, label: `${f.name}${f.status === "published" ? " (live)" : ""}` }))}
              />
            )}
          </div>
          {checking ? (
            <p className="flex items-center gap-2 text-body-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" aria-hidden="true" /> Checking what would change…
            </p>
          ) : null}
          {preview && blocked ? (
            <div className="flex flex-col gap-1 rounded-lg bg-status-danger-bg p-3 text-body-sm text-status-danger-fg" role="alert" data-move-blockers>
              <p className="flex items-center gap-1.5 font-semibold">
                <Ban className="size-4" aria-hidden="true" /> This page can&apos;t be moved
              </p>
              <ul className="list-disc pl-5">
                {preview.blockers.map((b, i) => <li key={i}>{b}</li>)}
              </ul>
            </div>
          ) : null}
          {preview && !blocked && preview.warnings.length ? (
            <div className="flex flex-col gap-1 rounded-lg bg-status-warning-bg p-3 text-body-sm text-status-warning-fg" data-move-warnings>
              <p className="flex items-center gap-1.5 font-semibold">
                <AlertTriangle className="size-4" aria-hidden="true" /> Before you move it
              </p>
              <ul className="list-disc pl-5">
                {preview.warnings.map((w, i) => <li key={i}>{w}</li>)}
              </ul>
            </div>
          ) : null}
          {preview && !blocked && !preview.warnings.length ? (
            <p className="text-body-sm text-muted-foreground">It&apos;s added as the last step of “{preview.targetFunnelName}” and removed from this funnel.</p>
          ) : null}
          {error ? <p className="text-caption text-destructive" role="alert">{error}</p> : null}
        </div>
        <DialogFooter>
          <Button type="button" variant="secondary" disabled={busy} onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" disabled={!preview || blocked || busy || checking} onClick={() => void move()} data-move-confirm>
            {busy ? <Loader2 className="animate-spin" aria-hidden="true" /> : <FolderInput aria-hidden="true" />}
            Move page
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
