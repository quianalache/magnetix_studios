"use client";

import { useCallback, useRef, useState, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

/**
 * ConfirmDialog (design-system Phase 1) — the shared replacement for
 * `window.confirm`, on the AlertDialog primitive.
 *
 * Controlled:
 *   <ConfirmDialog open={open} onOpenChange={setOpen} title="Delete this resource?"
 *     description="This can't be undone." confirmLabel="Delete" tone="danger"
 *     onConfirm={async () => { await remove(); }} />
 *
 * Imperative (drop-in for window.confirm — render `dialog` once):
 *   const { confirm, dialog } = useConfirm();
 *   if (await confirm({ title: "Discard changes?", tone: "danger", confirmLabel: "Discard" })) …
 *   return <>{…}{dialog}</>;
 *
 * While an async onConfirm runs, the action shows a spinner and the dialog
 * stays open; it closes when the promise resolves (stays open if it throws).
 */
export interface ConfirmOptions {
  title: ReactNode;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** "danger" for destructive actions (delete, discard, revoke). */
  tone?: "default" | "danger";
}

export function ConfirmDialog({
  open,
  onOpenChange,
  onConfirm,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  tone = "default",
}: ConfirmOptions & {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void | Promise<void>;
}) {
  const [pending, setPending] = useState(false);
  async function run() {
    setPending(true);
    try {
      await onConfirm();
      onOpenChange(false);
    } catch {
      // Keep the dialog open so the caller's error toast has context.
    } finally {
      setPending(false);
    }
  }
  return (
    <AlertDialog open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description ? <AlertDialogDescription>{description}</AlertDialogDescription> : null}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>{cancelLabel}</AlertDialogCancel>
          <Button
            variant={tone === "danger" ? "destructive" : "default"}
            className={tone === "danger" ? "bg-destructive text-white hover:bg-destructive/90" : undefined}
            onClick={run}
            disabled={pending}
          >
            {pending ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
            {confirmLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** Promise-based confirm for replacing `window.confirm` call sites. */
export function useConfirm() {
  const [state, setState] = useState<(ConfirmOptions & { open: boolean }) | null>(null);
  const resolver = useRef<((ok: boolean) => void) | null>(null);

  const confirm = useCallback((options: ConfirmOptions) => {
    setState({ ...options, open: true });
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const settle = (ok: boolean) => {
    resolver.current?.(ok);
    resolver.current = null;
    setState((s) => (s ? { ...s, open: false } : s));
  };

  const dialog = state ? (
    <ConfirmDialog
      {...state}
      open={state.open}
      onOpenChange={(open) => {
        if (!open) settle(false);
      }}
      onConfirm={() => settle(true)}
    />
  ) : null;

  return { confirm, dialog };
}
