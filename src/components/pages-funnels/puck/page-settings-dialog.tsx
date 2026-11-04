"use client";

import { useState } from "react";
import { Loader2, Settings2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useConfirm } from "@/components/system/confirm-dialog";
import { ImageFieldEditor } from "@/components/pages-funnels/puck/image-field";
import {
  PAGE_SETTINGS_LIMITS,
  SEO_RECOMMENDED,
  isGa4Id,
  isGtmId,
  isMetaPixelId,
  isPublicImageUrl,
  normalizeGa4Id,
  normalizeGtmId,
  normalizeMetaPixelId,
  pageNameProblem,
  type PageSettings,
} from "@/lib/pages-funnels/page-settings";

export interface PageSettingsDialogProps {
  pageId: string;
  pageName: string;
  liveUrl: string;
  /** Reading Result Pages: always noindex, no tenant tracking. */
  isReadingResult: boolean;
  isPublished: boolean;
  hasPublishedCopy: boolean;
  /** Disabled while a Popup (not the Page) is being edited. */
  disabled?: boolean;
  /** The CURRENT draft settings (read when the dialog opens). */
  readSettings: () => PageSettings;
  /** Writes settings into the draft (autosave persists them; Publish makes them live). */
  applySettings: (settings: PageSettings) => void;
  onUnpublish: () => Promise<boolean>;
  onRevert: () => Promise<boolean>;
}

type Section = "general" | "seo" | "tracking" | "publishing";

/**
 * Page Settings (Wave 3) — one place for the page-level settings that aren't
 * a block: name, SEO + social preview, noindex, tracking IDs, and the
 * publishing actions. Two kinds of setting, labelled as such in the UI:
 *  - Page name is internal and saves immediately (it never changes the URL).
 *  - SEO, social image, noindex and tracking are part of the DRAFT: they
 *    count as unpublished changes and go live with the next Publish.
 */
export function PageSettingsButton(props: PageSettingsDialogProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        disabled={props.disabled}
        aria-label="Page settings"
        title="Page settings"
        data-page-settings-trigger=""
      >
        <Settings2 className="h-4 w-4" />
        <span className="hidden xl:inline">Page settings</span>
      </Button>
      {open ? <PageSettingsDialog {...props} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function PageSettingsDialog({
  pageId,
  pageName,
  liveUrl,
  isReadingResult,
  isPublished,
  hasPublishedCopy,
  readSettings,
  applySettings,
  onUnpublish,
  onRevert,
  onClose,
}: PageSettingsDialogProps & { onClose: () => void }) {
  const [initial] = useState(readSettings);
  const [settings, setSettings] = useState<PageSettings>(initial);
  const [name, setName] = useState(pageName);
  const [section, setSection] = useState<Section>("general");
  const [saving, setSaving] = useState(false);
  const [busyAction, setBusyAction] = useState<"unpublish" | "revert" | null>(null);
  const { confirm, dialog } = useConfirm();

  const set = (patch: Partial<PageSettings>) => setSettings((s) => ({ ...s, ...patch }));
  const setTracking = (patch: Partial<PageSettings["tracking"]>) => setSettings((s) => ({ ...s, tracking: { ...s.tracking, ...patch } }));

  const nameError = pageNameProblem(name);
  const titleError = settings.seoTitle.length > PAGE_SETTINGS_LIMITS.seoTitle ? `Keep the SEO title under ${PAGE_SETTINGS_LIMITS.seoTitle} characters.` : null;
  const descriptionError = settings.seoDescription.length > PAGE_SETTINGS_LIMITS.seoDescription ? `Keep the description under ${PAGE_SETTINGS_LIMITS.seoDescription} characters.` : null;
  const imageError = settings.socialImage && !isPublicImageUrl(settings.socialImage) ? "Use a public https image." : null;
  const pixelError = settings.tracking.metaPixelId && !isMetaPixelId(settings.tracking.metaPixelId) ? "Use the numeric Pixel ID from Meta Events Manager." : null;
  const ga4Error = settings.tracking.ga4Id && !isGa4Id(settings.tracking.ga4Id) ? "A GA4 Measurement ID looks like G-XXXXXXXXXX." : null;
  const gtmError = settings.tracking.gtmId && !isGtmId(settings.tracking.gtmId) ? "A GTM Container ID looks like GTM-XXXXXXX." : null;
  const generalInvalid = !!nameError;
  const seoInvalid = !!(titleError || descriptionError || imageError);
  const trackingInvalid = !!(pixelError || ga4Error || gtmError);
  const invalid = generalInvalid || seoInvalid || trackingInvalid;
  const nameChanged = name.trim() !== pageName.trim();
  const settingsChanged = JSON.stringify(settings) !== JSON.stringify(initial);

  async function save() {
    if (invalid) {
      setSection(generalInvalid ? "general" : seoInvalid ? "seo" : "tracking");
      return;
    }
    setSaving(true);
    try {
      if (nameChanged) {
        const res = await fetch("/api/pages-funnels/puck/page-settings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pageId, action: "rename", name: name.trim() }),
        });
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        if (!res.ok) throw new Error(json.error ?? "Couldn't rename the page.");
      }
      if (settingsChanged) applySettings(settings);
      toast.success(
        settingsChanged
          ? isPublished
            ? "Page settings saved to your draft. Publish to make them live."
            : "Page settings saved to your draft."
          : "Page settings saved."
      );
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save page settings.");
    } finally {
      setSaving(false);
    }
  }

  async function unpublish() {
    const ok = await confirm({
      title: "Unpublish this page?",
      description: "Visitors will no longer be able to open it. Your draft and the last published version are kept, and you can publish again at any time.",
      confirmLabel: "Unpublish",
      tone: "danger",
    });
    if (!ok) return;
    setBusyAction("unpublish");
    const done = await onUnpublish();
    setBusyAction(null);
    if (done) onClose();
  }

  async function revert() {
    const ok = await confirm({
      title: "Revert your draft to the published version?",
      description: "Your unpublished changes — content, popups and page settings — will be replaced with what's live now. This can't be undone.",
      confirmLabel: "Revert draft",
      tone: "danger",
    });
    if (!ok) return;
    setBusyAction("revert");
    const done = await onRevert();
    setBusyAction(null);
    if (done) onClose();
  }

  const snippetTitle = settings.seoTitle.trim() || name.trim() || "Untitled page";

  return (
    <Dialog open onOpenChange={(o) => !o && !saving && onClose()}>
      {/* Header + footer stay put; only the section body scrolls, so Save is
          always reachable on short screens. */}
      <DialogContent className="flex max-h-[90dvh] flex-col sm:max-w-2xl" data-page-settings-dialog="">
        <DialogHeader>
          <DialogTitle>Page settings</DialogTitle>
          <DialogDescription>Name, search and social preview, tracking, and publishing for this page.</DialogDescription>
        </DialogHeader>

        <Tabs value={section} onValueChange={(v) => setSection(v as Section)} className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1">
          <TabsList variant="underline" className="bg-background sticky top-0 z-10 w-full shrink-0 justify-start overflow-x-auto">
            <TabsTrigger value="general" data-invalid={generalInvalid || undefined}>General</TabsTrigger>
            <TabsTrigger value="seo" data-invalid={seoInvalid || undefined}>SEO &amp; social</TabsTrigger>
            {!isReadingResult && <TabsTrigger value="tracking" data-invalid={trackingInvalid || undefined}>Tracking</TabsTrigger>}
            <TabsTrigger value="publishing">Publishing</TabsTrigger>
          </TabsList>

          <TabsContent value="general" className="space-y-4 pt-4">
            <Field label="Page name" htmlFor="ps-name" error={nameError} hint="Shown in Pages & Funnels and the builder. Saves right away and never changes the page's URL.">
              <Input id="ps-name" value={name} maxLength={PAGE_SETTINGS_LIMITS.name + 20} onChange={(e) => setName(e.target.value)} aria-invalid={!!nameError} />
            </Field>
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Page URL</Label>
              <p className="border-border bg-muted text-muted-foreground truncate rounded-md border px-3 py-2 text-xs" title={liveUrl}>{liveUrl}</p>
              <p className="text-muted-foreground text-caption">{isPublished ? "This page is live at this address." : "This page isn't live. It will be available at this address when published."}</p>
            </div>
          </TabsContent>

          <TabsContent value="seo" className="space-y-4 pt-4">
            <DraftNote isPublished={isPublished} />
            <Field label="SEO title" htmlFor="ps-seo-title" error={titleError} counter={{ value: settings.seoTitle.length, recommended: SEO_RECOMMENDED.title }} hint="The title in search results and the browser tab. Leave blank to use the page name.">
              <Input id="ps-seo-title" value={settings.seoTitle} placeholder={name.trim() || "Page name"} onChange={(e) => set({ seoTitle: e.target.value })} aria-invalid={!!titleError} />
            </Field>
            <Field label="SEO description" htmlFor="ps-seo-description" error={descriptionError} counter={{ value: settings.seoDescription.length, recommended: SEO_RECOMMENDED.description }} hint="A short summary for search results and link previews.">
              <Textarea id="ps-seo-description" rows={3} value={settings.seoDescription} onChange={(e) => set({ seoDescription: e.target.value })} aria-invalid={!!descriptionError} />
            </Field>
            <div className="space-y-1.5" data-page-settings-social-image="">
              <ImageFieldEditor value={settings.socialImage} onChange={(url) => set({ socialImage: url })} label="Social preview image" removable />
              <p className="text-muted-foreground text-caption">Shown when the page is shared on social media and in messages. 1200 × 630 works best.</p>
              {imageError ? <p className="text-destructive text-xs">{imageError}</p> : null}
            </div>
            <div className="border-border flex items-start justify-between gap-4 rounded-lg border p-3">
              <div>
                <Label htmlFor="ps-noindex" className="text-sm font-medium">Hide from search engines</Label>
                <p className="text-muted-foreground text-caption">{isReadingResult ? "Reading Result Pages are always hidden from search engines." : "Asks search engines not to list this page (noindex)."}</p>
              </div>
              <Switch id="ps-noindex" checked={isReadingResult || settings.noindex} disabled={isReadingResult} onCheckedChange={(v) => set({ noindex: !!v })} />
            </div>
            <div className="border-border rounded-lg border p-3" aria-label="Search result preview">
              <p className="text-muted-foreground text-caption mb-1">Search preview</p>
              <p className="truncate text-sm font-medium text-[var(--ds-text-link)]">{snippetTitle}</p>
              <p className="text-muted-foreground truncate text-xs">{liveUrl}</p>
              <p className="text-muted-foreground line-clamp-2 text-xs">{settings.seoDescription.trim() || "No description yet."}</p>
            </div>
          </TabsContent>

          {!isReadingResult && (
            <TabsContent value="tracking" className="space-y-4 pt-4">
              <DraftNote isPublished={isPublished} />
              <p className="text-muted-foreground text-xs">Your own tracking for this page. It runs only on the live published page — never in the builder or Preview.</p>
              <Field label="Meta Pixel ID" htmlFor="ps-pixel" error={pixelError}>
                <Input id="ps-pixel" inputMode="numeric" placeholder="e.g. 123456789012345" value={settings.tracking.metaPixelId} onChange={(e) => setTracking({ metaPixelId: normalizeMetaPixelId(e.target.value) })} aria-invalid={!!pixelError} />
              </Field>
              <Field label="GA4 Measurement ID" htmlFor="ps-ga4" error={ga4Error}>
                <Input id="ps-ga4" placeholder="G-XXXXXXXXXX" value={settings.tracking.ga4Id} onChange={(e) => setTracking({ ga4Id: normalizeGa4Id(e.target.value) })} aria-invalid={!!ga4Error} />
              </Field>
              <Field label="GTM Container ID" htmlFor="ps-gtm" error={gtmError}>
                <Input id="ps-gtm" placeholder="GTM-XXXXXXX" value={settings.tracking.gtmId} onChange={(e) => setTracking({ gtmId: normalizeGtmId(e.target.value) })} aria-invalid={!!gtmError} />
              </Field>
            </TabsContent>
          )}

          <TabsContent value="publishing" className="space-y-3 pt-4">
            <ActionRow
              title="Revert draft to published"
              body={hasPublishedCopy ? "Replace your unpublished changes (content, popups and page settings) with the live version." : "Available once the page has been published."}
              action={
                <Button type="button" variant="outline" size="sm" disabled={!hasPublishedCopy || busyAction !== null} onClick={revert} data-page-settings-revert="">
                  {busyAction === "revert" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null} Revert draft
                </Button>
              }
            />
            <ActionRow
              title="Unpublish"
              body={isPublished ? "Take the page offline. Nothing is deleted, and you can publish again any time." : "This page isn't published."}
              action={
                <Button type="button" variant="outline" size="sm" disabled={!isPublished || busyAction !== null} onClick={unpublish} data-page-settings-unpublish="">
                  {busyAction === "unpublish" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null} Unpublish
                </Button>
              }
            />
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button type="button" onClick={save} disabled={saving || (!nameChanged && !settingsChanged)} data-page-settings-save="">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Save
          </Button>
        </DialogFooter>
        {dialog}
      </DialogContent>
    </Dialog>
  );
}

function DraftNote({ isPublished }: { isPublished: boolean }) {
  return (
    <p className="bg-muted text-muted-foreground rounded-md px-3 py-2 text-xs">
      {isPublished ? "Saved to your draft. Changes go live when you publish." : "Saved to your draft. They go live when the page is published."}
    </p>
  );
}

function Field({
  label,
  htmlFor,
  hint,
  error,
  counter,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  error?: string | null;
  counter?: { value: number; recommended: number };
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={htmlFor} className="text-xs font-semibold">{label}</Label>
        {counter ? (
          <span className={counter.value > counter.recommended ? "text-caption text-[var(--ds-status-warning-fg)]" : "text-muted-foreground text-caption"}>
            {counter.value}/{counter.recommended}
          </span>
        ) : null}
      </div>
      {children}
      {error ? <p className="text-destructive text-xs">{error}</p> : hint ? <p className="text-muted-foreground text-caption">{hint}</p> : null}
    </div>
  );
}

function ActionRow({ title, body, action }: { title: string; body: string; action: React.ReactNode }) {
  return (
    <div className="border-border flex items-center justify-between gap-4 rounded-lg border p-3">
      <div className="min-w-0">
        <p className="text-sm font-medium">{title}</p>
        <p className="text-muted-foreground text-caption">{body}</p>
      </div>
      <div className="shrink-0">{action}</div>
    </div>
  );
}
