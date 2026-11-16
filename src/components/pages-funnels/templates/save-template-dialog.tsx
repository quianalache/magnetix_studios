"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, LayoutTemplate, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PAGE_TYPE_ICONS } from "@/components/pages-funnels/home/page-type-icons";
import { PAGE_TEMPLATE_LIMITS, templateNameProblem } from "@/lib/pages-funnels/page-templates";
import { newRequestId, savePageTemplate } from "@/lib/pages-funnels/page-templates-client";
import type { PageType } from "@/types/pages-funnels";

/**
 * Save as Template (Saved Page Templates, 2026-11-16 — approved mockup 2).
 * Opened from a page card's ⋮ menu and from the builder header. Saves an
 * independent snapshot of the page's CURRENT design (in the builder, the
 * on-screen state including edits not yet autosaved) into the workspace's
 * template library. Never publishes, renames or navigates away from the page.
 */
export function SaveTemplateDialog({
  open,
  onOpenChange,
  pageId,
  pageName,
  pageType,
  previewUrl,
  getCurrent,
  beforeSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pageId: string;
  pageName: string;
  pageType: PageType;
  /** A screenshot that shows exactly the design being saved, or null. */
  previewUrl: string | null;
  /** Builder only: the current on-screen design. */
  getCurrent?: () => { data: unknown; popups: unknown };
  /** Builder only: flush the page's own draft save alongside the template save. */
  beforeSave?: () => void;
}) {
  const [name, setName] = useState(pageName);
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  // One id per opening: a double click or a retried request returns the same template.
  const requestId = useRef(newRequestId());
  // Synchronous guard: two clicks in the same tick both see busy === false.
  const submitting = useRef(false);

  useEffect(() => {
    if (!open) return;
    setName(pageName);
    setDescription("");
    setError(null);
    setTouched(false);
    setImageFailed(false);
    requestId.current = newRequestId();
  }, [open, pageName]);

  const nameProblem = templateNameProblem(name);
  const Icon = PAGE_TYPE_ICONS[pageType] ?? PAGE_TYPE_ICONS.generic;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (nameProblem || busy || submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError(null);
    try {
      beforeSave?.();
      const template = await savePageTemplate({
        pageId,
        name: name.trim(),
        description: description.trim(),
        requestId: requestId.current,
        current: getCurrent ? getCurrent() : null,
      });
      toast.success(`Saved “${template.name}” as a template`, {
        description: "Find it under Create → Create Page → Use a Template.",
      });
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save the template. Try again.");
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-2xl" data-save-template-dialog="">
        <form onSubmit={save} className="flex flex-col gap-5" noValidate>
          <DialogHeader className="flex-row items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-tint-violet text-primary">
              <LayoutTemplate className="size-5" aria-hidden="true" />
            </span>
            <span className="flex min-w-0 flex-col gap-1">
              <DialogTitle className="text-title-md">Save as Template</DialogTitle>
              <DialogDescription>Save this page as a reusable design in your workspace.</DialogDescription>
            </span>
          </DialogHeader>

          <div className="grid gap-5 sm:grid-cols-[minmax(0,15rem)_minmax(0,1fr)]">
            <figure className="flex flex-col gap-2">
              <div className="overflow-hidden rounded-lg border border-border bg-muted">
                {previewUrl && !imageFailed ? (
                  // eslint-disable-next-line @next/next/no-img-element -- tokenized Storage URL of the page's own screenshot
                  <img src={previewUrl} alt={`Current design of ${pageName}`} className="aspect-[16/10] w-full object-cover object-top" onError={() => setImageFailed(true)} />
                ) : (
                  <div className="flex aspect-[16/10] w-full flex-col items-center justify-center gap-2 bg-tint-violet px-4 text-center" data-template-preview-fallback="">
                    <span className="flex size-9 items-center justify-center rounded-xl bg-card text-primary shadow-card">
                      <Icon className="size-4.5" aria-hidden="true" />
                    </span>
                    <span className="text-caption text-muted-foreground">A preview image is made from the template after you save.</span>
                  </div>
                )}
              </div>
              <figcaption className="text-caption text-muted-foreground">{previewUrl && !imageFailed ? "Design preview" : "Preview image coming after save"}</figcaption>
            </figure>

            <div className="flex min-w-0 flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="template-name">
                  Template name <span aria-hidden="true">*</span>
                </Label>
                <Input
                  id="template-name"
                  autoFocus
                  value={name}
                  maxLength={PAGE_TEMPLATE_LIMITS.name}
                  aria-invalid={touched && !!nameProblem}
                  aria-describedby={touched && nameProblem ? "template-name-error" : undefined}
                  onChange={(e) => setName(e.target.value)}
                  onBlur={() => setTouched(true)}
                  required
                />
                {touched && nameProblem ? (
                  <p id="template-name-error" className="text-caption text-destructive">
                    {nameProblem}
                  </p>
                ) : null}
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="template-description">Description (optional)</Label>
                <Textarea
                  id="template-description"
                  value={description}
                  maxLength={PAGE_TEMPLATE_LIMITS.description}
                  rows={3}
                  placeholder="What is this design good for?"
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>
            </div>
          </div>

          <p className="border-t border-border pt-4 text-body-sm text-primary">
            Saved as a new independent template. Later changes to this page won&apos;t change it, and everyone in this workspace can use it.
          </p>

          {error ? (
            <p role="alert" className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-body-sm text-destructive">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              <span>{error} Your page hasn&apos;t changed.</span>
            </p>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="secondary" disabled={busy} onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || (touched && !!nameProblem)}>
              {busy ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
              {busy ? "Saving…" : "Save template"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
