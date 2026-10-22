"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";
import { Archive, ArrowLeft, Code2, Copy, ExternalLink, Eye, FlaskConical, LayoutTemplate, Link2, Save, Share2, Sparkles, Trash2 } from "lucide-react";
import { useSubAccount } from "@/context/sub-account-context";
import { buildDecoderUrl } from "@/lib/domains/public-url";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { SettingsSection } from "@/components/system/settings-section";
import { StatusPill } from "@/components/system/status-pill";
import { DecoderEditorialPage } from "@/components/energetic-decoder/decoder-shell";
import { EMBED_STATUS_TONE, embedPreviewHref, type EmbedWithPlacements } from "@/components/energetic-decoder/embeds-tab";
import {
  defaultFeaturedOfferPresentation,
  EMBED_SHOW_HELP,
  EMBED_SHOW_LABEL,
  EMBED_SHOW_OPTIONS,
  EMBED_STATUS_LABEL,
  EMBED_VIEW_LABEL,
  EMBED_VIEWS,
  embedCombinationError,
  FEATURED_OFFER_LAYOUT_LABEL,
  FEATURED_OFFER_LAYOUTS,
  normalizeEmbedTags,
} from "@/lib/energetic-decoder/embeds";
import type {
  EmbedConfig,
  EmbedConsentPurpose,
  EmbedFieldMode,
  EmbedNextStep,
  EmbedShowOnPage,
  EmbedStatus,
} from "@/types/embed-config";
import type { FeaturedOfferLayout } from "@/types/reading-blocks";

/**
 * The Reading Tool editor (2026-10-21). A Reading Tool is the public form
 * someone fills in to get their Reading, plus everything that happens
 * after. Ways to share first, then the order an owner thinks in:
 * Who can use it → Form → Reading → Delivery → After submitting → Contact &
 * automation.
 *
 * "After submitting" picks the result: the built-in Standard Result (with a
 * few beginner-friendly settings shown right there) or a custom Reading
 * Result Page built in Pages & Funnels — in which case the Standard
 * Result's settings are hidden, because the page's own blocks decide what
 * appears. The Content Set always stays here: it's saved into every
 * Reading, so the result, MyMagnetix and the Reading Report always agree.
 */

interface EditorOptions {
  contentSets: { id: string; name: string; isDefault: boolean }[];
  chartDesigns: { id: string; name: string; isDefault: boolean }[];
  courses: { id: string; title: string; published: boolean }[];
  offers: { id: string; title: string; published: boolean }[];
  resultPages: { id: string; name: string; published: boolean }[];
  systems: { humanDesign: boolean; astrology: boolean };
}

type Draft = Pick<EmbedConfig, "name" | "placementNote" | "status" | "access" | "form" | "reading" | "afterSubmit" | "contact">;

function toDraft(e: EmbedConfig): Draft {
  return {
    name: e.name,
    placementNote: e.placementNote,
    status: e.status,
    access: e.access,
    form: e.form,
    reading: e.reading,
    afterSubmit: e.afterSubmit,
    contact: e.contact,
  };
}

type NextStepMode = "none" | "button" | "featuredOffer";

function nextStepMode(step: EmbedNextStep): NextStepMode {
  if (step.kind === "featuredOffer") return "featuredOffer";
  if (step.kind === "course" || step.kind === "offer" || step.kind === "url") return "button";
  return "none";
}

export function EmbedEditor({ embedId }: { embedId: string }) {
  const { subAccountId, subAccount, saPath } = useSubAccount();
  const router = useRouter();
  const pathname = usePathname();
  const [embed, setEmbed] = useState<EmbedWithPlacements | null>(null);
  const [options, setOptions] = useState<EditorOptions | null>(null);
  const [testRecords, setTestRecords] = useState(0);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [tagsText, setTagsText] = useState("");
  const [saving, setSaving] = useState(false);
  const [installOpen, setInstallOpen] = useState(false);
  const [notFound, setNotFound] = useState(false);

  const backToList = () => router.push(`${pathname}?tab=embeds`, { scroll: false });

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/sub-accounts/${subAccountId}/energetic-decoder/embeds/${embedId}`)
      .then(async (r) => {
        if (r.status === 404) {
          if (!cancelled) setNotFound(true);
          return;
        }
        const d = await r.json();
        if (cancelled) return;
        setEmbed(d.embed);
        setOptions({ resultPages: [], ...d.options });
        setTestRecords(d.testRecords ?? 0);
        setDraft(toDraft(d.embed));
        setTagsText((d.embed.contact.tags as string[]).join(", "));
      })
      .catch(() => toast.error("Couldn't load this Reading Tool."));
    return () => {
      cancelled = true;
    };
  }, [subAccountId, embedId]);

  const combinationError = useMemo(() => (draft ? embedCombinationError(draft) : null), [draft]);
  const dirty = useMemo(() => {
    if (!embed || !draft) return false;
    return JSON.stringify(toDraft(embed)) !== JSON.stringify({ ...draft, contact: { tags: normalizeEmbedTags(tagsText.split(",")) } });
  }, [embed, draft, tagsText]);

  if (notFound) {
    return (
      <DecoderEditorialPage icon={Share2} title="Reading Tool not found">
        <Button variant="outline" onClick={backToList}>
          <ArrowLeft className="size-4" />
          All Reading Tools
        </Button>
      </DecoderEditorialPage>
    );
  }
  if (!embed || !draft || !options) {
    return (
      <DecoderEditorialPage icon={Share2} title="Reading Tool">
        <div className="h-64 animate-pulse rounded-card bg-muted" />
      </DecoderEditorialPage>
    );
  }

  const update = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => (d ? { ...d, [key]: value } : d));
  const after = draft.afterSubmit;
  const setAfter = (patch: Partial<Draft["afterSubmit"]>) => update("afterSubmit", { ...after, ...patch });
  const embedUrl = `${buildDecoderUrl({ subAccount, subAccountId })}?embed=${encodeURIComponent(embed.id)}`;
  const custom = after.destination.kind === "customPage";
  const chosenPage = after.destination.kind === "customPage" ? options.resultPages.find((p) => p.id === (after.destination as { pageId: string }).pageId) : undefined;

  async function save(nextStatus?: EmbedStatus) {
    if (!draft) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/sub-accounts/${subAccountId}/energetic-decoder/embeds/${embedId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...draft, status: nextStatus ?? draft.status, contact: { tags: normalizeEmbedTags(tagsText.split(",")) } }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't save.");
      setEmbed((prev) => (prev ? { ...data.embed, placements: prev.placements } : prev));
      setDraft(toDraft(data.embed));
      setTagsText((data.embed.contact.tags as string[]).join(", "));
      toast.success(
        nextStatus === "live"
          ? "Reading Tool is live."
          : nextStatus === "archived"
            ? "Reading Tool archived."
            : nextStatus === "draft"
              ? "Reading Tool is offline (Draft)."
              : "Saved.",
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save.");
    } finally {
      setSaving(false);
    }
  }

  async function cleanupTests() {
    const res = await fetch(`/api/sub-accounts/${subAccountId}/energetic-decoder/embeds/${embedId}/test-records`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return toast.error("Couldn't clean up test records.");
    setTestRecords(0);
    toast.success(`Deleted ${data.removed?.readings ?? 0} test reading(s).`);
  }

  async function remove() {
    if (!confirm(`Delete “${embed?.name}”? This can’t be undone.`)) return;
    const res = await fetch(`/api/sub-accounts/${subAccountId}/energetic-decoder/embeds/${embedId}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return toast.error(data.error ?? "Couldn't delete.");
    toast.success("Reading Tool deleted.");
    backToList();
  }

  const copy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied`);
  };

  const viewAvailable = (v: (typeof EMBED_VIEWS)[number]) => (v === "astrology" ? options.systems.astrology : options.systems.humanDesign);
  const nextStep = after.nextStep;
  const stepMode = nextStepMode(nextStep);

  function setStepMode(mode: NextStepMode) {
    if (mode === "none") return setAfter({ nextStep: { kind: "none" } });
    if (mode === "featuredOffer") {
      return setAfter({ nextStep: { kind: "featuredOffer", offerId: options!.offers.find((o) => o.published)?.id ?? options!.offers[0]?.id ?? "", ...defaultFeaturedOfferPresentation(), ctaLabel: "Learn more" } });
    }
    setAfter({ nextStep: { kind: "url", url: "https://", label: "Continue" } });
  }

  return (
    <DecoderEditorialPage
      icon={Share2}
      title={embed.name}
      description="The form people fill in to get their Reading, and everything that happens after."
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" render={<a href={embedPreviewHref(subAccountId, embed.id, "preview")} target="_blank" rel="noreferrer" />}>
            <Eye className="size-4" />
            Preview
          </Button>
          <Button variant="outline" render={<a href={embedPreviewHref(subAccountId, embed.id, "test")} target="_blank" rel="noreferrer" />}>
            <FlaskConical className="size-4" />
            Run a test
          </Button>
          <Button onClick={() => save()} disabled={saving || !dirty}>
            <Save className="size-4" />
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      }
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button type="button" onClick={backToList} className="inline-flex items-center gap-1.5 text-body-sm font-medium text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" />
          All Reading Tools
        </button>
        <div className="flex items-center gap-2">
          {/* The saved status — it only changes through these actions, which
              save immediately (pending edits included). */}
          <StatusPill tone={EMBED_STATUS_TONE[embed.status]}>{EMBED_STATUS_LABEL[embed.status]}</StatusPill>
          {embed.status === "live" ? (
            <Button size="sm" variant="outline" onClick={() => save("draft")} disabled={saving}>
              Take offline
            </Button>
          ) : (
            <Button size="sm" onClick={() => save("live")} disabled={saving || !!combinationError}>
              {embed.status === "archived" ? "Restore & go live" : "Go live"}
            </Button>
          )}
        </div>
      </div>

      {/* Ways to share */}
      <div className="space-y-2">
        <p className="text-body-sm font-semibold">Ways to share</p>
        <div className="grid gap-3 md:grid-cols-3">
          <ShareCard icon={LayoutTemplate} title="Pages & Funnels">
            <p>In the page builder, open <strong className="font-medium text-foreground">Business</strong>, add <strong className="font-medium text-foreground">Reading Tool</strong>, and choose this one. No code.</p>
            <Link href={saPath("/pages-funnels")} className="mt-1 inline-flex items-center gap-1 font-medium text-foreground underline">
              Open Pages &amp; Funnels
              <ExternalLink className="size-3.5" />
            </Link>
          </ShareCard>
          <ShareCard icon={Code2} title="Website">
            A snippet for WordPress, Squarespace, Showit or any site — or an iframe for builders that only take iframes.
            <button type="button" onClick={() => setInstallOpen(true)} className="mt-1 inline-flex items-center gap-1 font-medium text-foreground underline">
              Get install code
            </button>
          </ShareCard>
          <ShareCard icon={Link2} title="Direct link">
            The tool’s own page — for emails, social bios and testing. Add utm_ tags to track a campaign.
            <button type="button" onClick={() => copy(embedUrl, "Link")} className="mt-1 inline-flex items-center gap-1 font-medium text-foreground underline">
              <Copy className="size-3.5" />
              Copy link
            </button>
          </ShareCard>
        </div>
        <p className="text-body-sm text-muted-foreground">
          {embed.status === "live"
            ? "Live — people can use it now. Saved changes reach visitors right away."
            : embed.status === "archived"
              ? "Archived — no new Readings. Everyone who already got a Reading keeps it. Preview and Run a test still work for you."
              : "Draft — visitors can’t use it until you click Go live. Preview and Run a test always work for you."}
        </p>
      </div>

      <SettingsSection title="Name" description="Only you see the name — visitors never do.">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="ee-name">Reading Tool name</Label>
            <Input id="ee-name" value={draft.name} onChange={(e) => update("name", e.target.value)} maxLength={80} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ee-note">Internal note</Label>
            <Input id="ee-note" value={draft.placementNote} onChange={(e) => update("placementNote", e.target.value)} maxLength={200} placeholder="e.g. Homepage hero, spring campaign" />
          </div>
        </div>
      </SettingsSection>

      <SettingsSection title="1 · Who can use it" description="Who can submit the form and get a Reading.">
        <div className="space-y-1 text-body-sm">
          <p>
            <strong>Everyone, free.</strong> While it’s Live, anyone who reaches this form — on a Magnetix page, on another website or
            through the direct link — can submit it and get a Reading. No sign-in or payment.
          </p>
          <p className="text-muted-foreground">Charging for Readings (sold through an Offer) arrives in the next phase.</p>
        </div>
      </SettingsSection>

      <SettingsSection title="2 · Form" description="Name, email, birth date, time and place are always asked.">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5 md:col-span-2">
            <Label htmlFor="ee-title">Title</Label>
            <Input id="ee-title" value={draft.form.title} onChange={(e) => update("form", { ...draft.form, title: e.target.value })} maxLength={120} />
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label htmlFor="ee-intro">Intro</Label>
            <Textarea id="ee-intro" value={draft.form.intro} onChange={(e) => update("form", { ...draft.form, intro: e.target.value })} maxLength={400} rows={2} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ee-button">Button label</Label>
            <Input id="ee-button" value={draft.form.buttonLabel} onChange={(e) => update("form", { ...draft.form, buttonLabel: e.target.value })} maxLength={40} />
          </div>
          <div className="space-y-1.5">
            <Label>Phone</Label>
            <SegmentedControl
              value={draft.form.phone}
              onChange={(v) => update("form", { ...draft.form, phone: v as EmbedFieldMode })}
              options={[
                { value: "off", label: "Off" },
                { value: "optional", label: "Optional" },
                { value: "required", label: "Required" },
              ]}
            />
          </div>
          <div className="space-y-2 md:col-span-2">
            <label className="flex items-center gap-2 text-body-sm">
              <Switch checked={draft.form.consent.enabled} onCheckedChange={(v) => update("form", { ...draft.form, consent: { ...draft.form.consent, enabled: v } })} />
              Ask them to tick a consent box
            </label>
            {draft.form.consent.enabled && (
              <div className="space-y-3">
                <Textarea
                  aria-label="Consent text"
                  value={draft.form.consent.text}
                  onChange={(e) => update("form", { ...draft.form, consent: { ...draft.form.consent, text: e.target.value } })}
                  maxLength={400}
                  rows={2}
                />
                <div className="space-y-1.5">
                  <Label>What does ticking it mean?</Label>
                  <SegmentedControl
                    value={draft.form.consent.purpose}
                    onChange={(v) => update("form", { ...draft.form, consent: { ...draft.form.consent, purpose: v as EmbedConsentPurpose } })}
                    options={[
                      { value: "agreement", label: "An agreement" },
                      { value: "emailMarketing", label: "Marketing email permission" },
                    ]}
                  />
                  <p className="text-caption text-muted-foreground">
                    {draft.form.consent.purpose === "emailMarketing"
                      ? "Recorded on their Reading, and the Contact is marked as opted in to marketing email — the same as a Form’s email-consent box. Make sure your wording asks for that."
                      : "Recorded on their Reading with your exact wording, the date and where they were. It doesn’t opt them in to marketing email."}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </SettingsSection>

      <SettingsSection title="3 · Reading" description="The words and the look of every Reading made with this tool.">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Reading text (Content Set)</Label>
            <Select
              value={draft.reading.contentSetId}
              onValueChange={(v) => v && update("reading", { ...draft.reading, contentSetId: v })}
              items={Object.fromEntries(options.contentSets.map((s) => [s.id, s.name]))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {options.contentSets.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-caption text-muted-foreground">
              Saved into each Reading, so their result, MyMagnetix and Reading Report always say the same thing. Blank entries in a custom set
              use Default’s text.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label>Chart colors (Chart Design)</Label>
            <Select
              value={draft.reading.chartDesignSetId ?? "__default"}
              onValueChange={(v) => v && update("reading", { ...draft.reading, chartDesignSetId: v === "__default" ? null : v })}
              items={{ __default: "Your default design", ...Object.fromEntries(options.chartDesigns.map((s) => [s.id, s.name])) }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__default">Your default design</SelectItem>
                {options.chartDesigns.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-caption text-muted-foreground">
              Colors for the Human Design, Mandala and Astrology charts. A Reading Result Page can choose its own.
            </p>
          </div>
          <div className="space-y-1 md:col-span-2">
            <Label>Systems calculated</Label>
            <p className="text-body-sm">
              {[options.systems.humanDesign && "Human Design (with Mandala)", options.systems.astrology && "Astrology"].filter(Boolean).join(" · ") || "None turned on"}
            </p>
            <p className="text-caption text-muted-foreground">Set for every Reading in Reading Configuration (Readings tab).</p>
          </div>
        </div>
      </SettingsSection>

      <SettingsSection title="4 · Delivery" description="Where their Reading lives after today.">
        <div className="grid gap-3 md:grid-cols-2">
          <DeliveryToggle
            checked={after.myMagnetix}
            onChange={(v) => setAfter({ myMagnetix: v })}
            label="Save to MyMagnetix"
            help="Their permanent home for this Reading. The result shows “Open your Reading in MyMagnetix”; first-timers finish access from an email link."
          />
          <DeliveryToggle
            checked={after.email}
            onChange={(v) => setAfter({ email: v })}
            label="Email them a link to their Reading"
            help={after.myMagnetix ? "A “Your Reading is ready” email that opens it in MyMagnetix." : "A “Your Reading is ready” email with a link that works for 24 hours, then through MyMagnetix."}
          />
        </div>
      </SettingsSection>

      <SettingsSection title="5 · After submitting" description="What they see the moment they submit.">
        <div className="space-y-5">
          <RadioGroup
            aria-label="After submitting"
            value={after.destination.kind}
            onValueChange={(v) =>
              setAfter({
                destination: v === "customPage" ? { kind: "customPage", pageId: options.resultPages[0]?.id ?? "" } : { kind: "standard" },
              })
            }
            className="gap-2 md:grid-cols-2"
          >
            <ChoiceCard value="standard" selected={!custom} title="Standard Result" help="A ready-made result right where the form was. Choose a few options below." />
            <ChoiceCard
              value="customPage"
              selected={custom}
              title="Custom Reading Result Page"
              help="Your own page from Pages & Funnels — place charts, copy, video, testimonials and offers wherever you like."
            />
          </RadioGroup>

          {custom ? (
            <div className="space-y-3 rounded-lg border border-border p-4">
              {options.resultPages.length === 0 ? (
                <div className="space-y-2 text-body-sm">
                  <p>You don’t have a Reading Result Page yet.</p>
                  <Link href={saPath("/pages-funnels")} className="inline-flex items-center gap-1 font-medium underline">
                    <Sparkles className="size-4" />
                    Create one in Pages &amp; Funnels → New Page → Reading Result Page
                  </Link>
                </div>
              ) : (
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label>Reading Result Page</Label>
                    <Select
                      value={after.destination.kind === "customPage" ? after.destination.pageId || null : null}
                      onValueChange={(v) => v && setAfter({ destination: { kind: "customPage", pageId: v } })}
                      items={Object.fromEntries(options.resultPages.map((p) => [p.id, p.published ? p.name : `${p.name} (Draft)`]))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Choose a page…" />
                      </SelectTrigger>
                      <SelectContent>
                        {options.resultPages.map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.published ? p.name : `${p.name} (Draft)`}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {chosenPage && (
                    <div className="space-y-1.5 text-body-sm">
                      <Label>Status</Label>
                      <p className="flex flex-wrap items-center gap-2">
                        <StatusPill tone={chosenPage.published ? "success" : "neutral"}>{chosenPage.published ? "Published" : "Draft"}</StatusPill>
                        <Link href={saPath(`/pages-funnels/${chosenPage.id}/new-builder`)} className="inline-flex items-center gap-1 font-medium underline">
                          Open in the builder
                          <ExternalLink className="size-3.5" />
                        </Link>
                      </p>
                    </div>
                  )}
                </div>
              )}
              <ul className="list-disc space-y-1 pl-5 text-caption text-muted-foreground">
                <li>After they submit, the whole browser tab moves to this page — even from a website install — showing their own Reading.</li>
                <li>The page decides what appears with its blocks. The Standard Result settings don’t apply.</li>
                <li>Run a test opens the draft. Visitors are sent there only once the page is published.</li>
              </ul>
            </div>
          ) : (
            <div className="space-y-5 rounded-lg border border-border p-4">
              <p className="text-body-sm font-semibold">Standard Result</p>
              <div className="space-y-1.5">
                <Label id="ee-show-label">Show</Label>
                <RadioGroup
                  aria-labelledby="ee-show-label"
                  value={after.show}
                  onValueChange={(v) => setAfter({ show: v as EmbedShowOnPage })}
                  className="gap-2 md:grid-cols-3"
                >
                  {EMBED_SHOW_OPTIONS.map((o) => (
                    <ChoiceCard key={o} value={o} selected={after.show === o} title={EMBED_SHOW_LABEL[o]} help={EMBED_SHOW_HELP[o]} />
                  ))}
                </RadioGroup>
              </div>
              {after.show !== "confirmation" && (
                <div className="space-y-2">
                  <Label>Charts to show</Label>
                  <div className="flex flex-wrap gap-4">
                    {EMBED_VIEWS.map((v) => {
                      const available = viewAvailable(v);
                      const checked = draft.reading.views.includes(v);
                      return (
                        <label key={v} className={`flex items-center gap-2 text-body-sm ${available ? "" : "opacity-60"}`}>
                          <Checkbox
                            checked={checked && available}
                            disabled={!available}
                            onCheckedChange={(on) =>
                              update("reading", {
                                ...draft.reading,
                                views: EMBED_VIEWS.filter((x) => (x === v ? on === true : draft.reading.views.includes(x))),
                              })
                            }
                          />
                          {EMBED_VIEW_LABEL[v]}
                        </label>
                      );
                    })}
                  </div>
                  <p className="text-caption text-muted-foreground">With two or more, visitors switch between them with tabs.</p>
                </div>
              )}
              <div className="space-y-1.5">
                <Label htmlFor="ee-confirm">Thank-you message</Label>
                <Input id="ee-confirm" value={after.confirmationMessage} onChange={(e) => setAfter({ confirmationMessage: e.target.value })} maxLength={400} />
              </div>
              <DeliveryToggle checked={after.pdf} onChange={(v) => setAfter({ pdf: v })} label="Show a Download PDF button" help="Lets them save their Reading as a PDF." />

              <div className="space-y-3">
                <Label>Next step</Label>
                <SegmentedControl
                  value={stepMode}
                  onChange={(v) => setStepMode(v as NextStepMode)}
                  options={[
                    { value: "none", label: "None" },
                    { value: "button", label: "Button" },
                    { value: "featuredOffer", label: "Featured Offer" },
                  ]}
                />
                {stepMode === "button" && (nextStep.kind === "course" || nextStep.kind === "offer" || nextStep.kind === "url") && (
                  <div className="grid gap-4 md:grid-cols-3">
                    <div className="space-y-1.5">
                      <Label>Goes to</Label>
                      <Select
                        value={nextStep.kind}
                        onValueChange={(v) => {
                          const label = nextStep.label || "Continue";
                          setAfter({
                            nextStep:
                              v === "course"
                                ? { kind: "course", courseId: options.courses[0]?.id ?? "", label }
                                : v === "offer"
                                  ? { kind: "offer", offerId: options.offers[0]?.id ?? "", label }
                                  : { kind: "url", url: "https://", label },
                          });
                        }}
                        items={{ course: "A course", offer: "An Offer’s checkout", url: "A page or URL" }}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="course" disabled={options.courses.length === 0}>
                            A course
                          </SelectItem>
                          <SelectItem value="offer" disabled={options.offers.length === 0}>
                            An Offer’s checkout
                          </SelectItem>
                          <SelectItem value="url">A page or URL</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {nextStep.kind === "course" && (
                      <div className="space-y-1.5">
                        <Label>Course</Label>
                        <Select
                          value={nextStep.courseId}
                          onValueChange={(v) => v && setAfter({ nextStep: { ...nextStep, courseId: v } })}
                          items={Object.fromEntries(options.courses.map((c) => [c.id, c.title]))}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {options.courses.map((c) => (
                              <SelectItem key={c.id} value={c.id}>
                                {c.title}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                    {nextStep.kind === "offer" && (
                      <div className="space-y-1.5">
                        <Label>Offer</Label>
                        <Select
                          value={nextStep.offerId}
                          onValueChange={(v) => v && setAfter({ nextStep: { ...nextStep, offerId: v } })}
                          items={Object.fromEntries(options.offers.map((o) => [o.id, o.title]))}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {options.offers.map((o) => (
                              <SelectItem key={o.id} value={o.id}>
                                {o.title}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                    {nextStep.kind === "url" && (
                      <div className="space-y-1.5">
                        <Label htmlFor="ee-url">Link</Label>
                        <Input id="ee-url" value={nextStep.url} onChange={(e) => setAfter({ nextStep: { ...nextStep, url: e.target.value } })} />
                      </div>
                    )}
                    <div className="space-y-1.5">
                      <Label htmlFor="ee-step-label">Button label</Label>
                      <Input id="ee-step-label" value={nextStep.label} maxLength={40} onChange={(e) => setAfter({ nextStep: { ...nextStep, label: e.target.value } })} />
                    </div>
                  </div>
                )}
                {nextStep.kind === "featuredOffer" && (
                  <FeaturedOfferSettings
                    step={nextStep}
                    offers={options.offers}
                    onChange={(next) => setAfter({ nextStep: next })}
                  />
                )}
              </div>
            </div>
          )}

          {combinationError && (
            <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-body-sm text-destructive">
              {combinationError}
            </p>
          )}
        </div>
      </SettingsSection>

      <SettingsSection title="6 · Contact & automation" description="New and returning visitors, in your CRM.">
        <div className="space-y-3 text-body-sm">
          <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
            <li>New visitors become Contacts (source “Energetic Decoder”). Returning visitors are matched by email — their details are never overwritten.</li>
            <li>Every submission creates a Reading and an activity entry on the Contact, including where it came from (page, website, campaign).</li>
            <li>
              Start follow-up in{" "}
              <Link href={saPath("/workflows")} className="font-medium text-foreground underline">
                Workflows
              </Link>{" "}
              with <strong className="text-foreground">Reading created</strong> — it fires for every Reading through this Reading Tool, new and
              returning Contacts alike (Test runs excluded).
            </li>
          </ul>
          <div className="space-y-1.5">
            <Label htmlFor="ee-tags">Tags to add</Label>
            <Input id="ee-tags" value={tagsText} onChange={(e) => setTagsText(e.target.value)} placeholder="e.g. blueprint, free-reading" />
            <p className="text-caption text-muted-foreground">Comma-separated. Added to new and returning Contacts; existing tags are never removed. Useful for filtering lists and broadcasts.</p>
          </div>
        </div>
      </SettingsSection>

      <SettingsSection title="Placements & housekeeping">
        <div className="space-y-5 text-body-sm">
          <div className="space-y-1.5">
            <Label>Placed on these Pages &amp; Funnels pages</Label>
            {embed.placements.length === 0 ? (
              <p className="text-muted-foreground">None yet.</p>
            ) : (
              <ul className="space-y-1">
                {embed.placements.map((p) => (
                  <li key={p.pageId} className="flex items-center gap-2">
                    <span className="truncate">{p.name}</span>
                    <StatusPill tone={p.published ? "success" : "neutral"}>{p.published ? "Published" : "Draft only"}</StatusPill>
                  </li>
                ))}
              </ul>
            )}
            <p className="text-caption text-muted-foreground">Website installs aren’t listed. A published page shows the tool only while this Reading Tool is Live.</p>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border px-3 py-2.5">
            <span>
              Test records: <strong>{testRecords}</strong> <span className="text-muted-foreground">(hidden from Readings, Contacts and counts)</span>
            </span>
            <Button size="sm" variant="outline" onClick={cleanupTests} disabled={testRecords === 0}>
              Delete test records
            </Button>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-muted-foreground">
              {embed.status === "archived"
                ? "Archived — no new Readings. Use “Restore & go live” at the top to bring it back."
                : "Archive stops new Readings. Everyone who already got a Reading keeps it in MyMagnetix."}
            </span>
            {embed.status !== "archived" && (
              <Button size="sm" variant="outline" onClick={() => save("archived")} disabled={saving}>
                <Archive className="size-4" />
                Archive
              </Button>
            )}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-muted-foreground">
              {embed.stats.readings > 0 ? "This Reading Tool has Readings, so it can’t be deleted — archive it instead." : "Delete this Reading Tool permanently."}
            </span>
            {embed.stats.readings === 0 && (
              <Button size="sm" variant="outline" onClick={remove}>
                <Trash2 className="size-4" />
                Delete
              </Button>
            )}
          </div>
        </div>
      </SettingsSection>

      <InstallDialog open={installOpen} onOpenChange={setInstallOpen} embedUrl={embedUrl} onCopy={copy} />
    </DecoderEditorialPage>
  );
}

function ShareCard({ icon: Icon, title, children }: { icon: typeof Code2; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-card border border-border bg-card p-4 shadow-card">
      <div className="flex items-start gap-3">
        <Icon className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
        <div className="flex min-w-0 flex-col items-start gap-0.5 text-body-sm text-muted-foreground">
          <p className="font-semibold text-foreground">{title}</p>
          {children}
        </div>
      </div>
    </div>
  );
}

function ChoiceCard({ value, selected, title, help }: { value: string; selected: boolean; title: string; help: string }) {
  return (
    <label
      className={`flex cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2.5 transition-colors ${
        selected ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40"
      }`}
    >
      <RadioGroupItem value={value} className="mt-0.5" />
      <span className="min-w-0 space-y-0.5">
        <span className="block text-body-sm font-medium">{title}</span>
        <span className="block text-caption text-muted-foreground">{help}</span>
      </span>
    </label>
  );
}

function FeaturedOfferSettings({
  step,
  offers,
  onChange,
}: {
  step: Extract<EmbedNextStep, { kind: "featuredOffer" }>;
  offers: EditorOptions["offers"];
  onChange: (next: Extract<EmbedNextStep, { kind: "featuredOffer" }>) => void;
}) {
  if (offers.length === 0) {
    return <p className="text-body-sm text-muted-foreground">You don’t have any Offers yet. Create one under Courses → Offers.</p>;
  }
  const chosen = offers.find((o) => o.id === step.offerId);
  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Offer</Label>
          <Select
            value={step.offerId || null}
            onValueChange={(v) => v && onChange({ ...step, offerId: v })}
            items={Object.fromEntries(offers.map((o) => [o.id, o.published ? o.title : `${o.title} (Draft)`]))}
          >
            <SelectTrigger>
              <SelectValue placeholder="Choose an Offer…" />
            </SelectTrigger>
            <SelectContent>
              {offers.map((o) => (
                <SelectItem key={o.id} value={o.id}>
                  {o.published ? o.title : `${o.title} (Draft)`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {chosen && !chosen.published && <p className="text-caption text-amber-700">This Offer is a Draft — visitors won’t see it until it’s published.</p>}
        </div>
        <div className="space-y-1.5">
          <Label>Layout</Label>
          <SegmentedControl
            value={step.layout}
            onChange={(v) => onChange({ ...step, layout: v as FeaturedOfferLayout })}
            options={FEATURED_OFFER_LAYOUTS.map((l) => ({ value: l, label: FEATURED_OFFER_LAYOUT_LABEL[l] }))}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="fo-headline">Headline (optional)</Label>
          <Input id="fo-headline" value={step.headline} maxLength={120} placeholder="Uses the Offer’s title" onChange={(e) => onChange({ ...step, headline: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="fo-cta">Button label</Label>
          <Input id="fo-cta" value={step.ctaLabel} maxLength={40} placeholder="Learn more" onChange={(e) => onChange({ ...step, ctaLabel: e.target.value })} />
        </div>
        <div className="space-y-1.5 md:col-span-2">
          <Label htmlFor="fo-body">Short copy (optional)</Label>
          <Textarea id="fo-body" value={step.body} maxLength={400} rows={2} placeholder="Uses the Offer’s description" onChange={(e) => onChange({ ...step, body: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="fo-badge">Badge (optional)</Label>
          <Input id="fo-badge" value={step.badge} maxLength={30} placeholder="e.g. Limited spots" onChange={(e) => onChange({ ...step, badge: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="fo-image">Image URL (optional)</Label>
          <Input id="fo-image" value={step.imageUrl} maxLength={500} placeholder="Uses the Offer’s image" onChange={(e) => onChange({ ...step, imageUrl: e.target.value })} />
        </div>
      </div>
      <p className="text-caption text-muted-foreground">
        Price, billing terms and what’s included always come from the Offer itself, so the card can never promise something different from
        checkout.
      </p>
    </div>
  );
}

function DeliveryToggle({ checked, onChange, label, help }: { checked: boolean; onChange: (v: boolean) => void; label: string; help: string }) {
  return (
    <label className="flex cursor-pointer items-start gap-2.5 text-body-sm">
      <Switch checked={checked} onCheckedChange={onChange} className="mt-0.5" />
      <span className="min-w-0 space-y-0.5">
        <span className="block font-medium">{label}</span>
        <span className="block text-caption text-muted-foreground">{help}</span>
      </span>
    </label>
  );
}

function InstallDialog({
  open,
  onOpenChange,
  embedUrl,
  onCopy,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  embedUrl: string;
  onCopy: (text: string, label: string) => void;
}) {
  const [kind, setKind] = useState<"script" | "iframe">("script");
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const script = `<script src="${origin}/reading-tool.js" data-embed-url="${embedUrl}" async></script>`;
  const iframeSrc = `${embedUrl}&embedded=1`;
  const iframe = `<iframe src="${iframeSrc}" title="Reading" style="width:100%;min-height:1400px;border:0" loading="lazy"></iframe>`;
  const code = kind === "script" ? script : iframe;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Install on a website</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <SegmentedControl
            value={kind}
            onChange={setKind}
            options={[
              { value: "script", label: "Any website" },
              { value: "iframe", label: "Iframe-only builders" },
            ]}
          />
          <p className="text-body-sm text-muted-foreground">
            {kind === "script"
              ? "Paste where the tool should appear (a custom code / HTML block). It resizes itself, carries the page’s campaign tags (utm_…) into Magnetix, and moves the visitor to your Reading Result Page when you use one."
              : "For builders that only accept an iframe URL or iframe code. Set a generous height — iframes can’t resize themselves. With a Reading Result Page, visitors get an “Open your Reading” button."}
          </p>
          <Textarea readOnly value={code} rows={kind === "script" ? 3 : 4} className="font-mono text-caption" />
          <Button onClick={() => onCopy(code, "Install code")} className="w-full">
            <Copy className="size-4" />
            Copy code
          </Button>
          {kind === "iframe" && (
            <div className="flex gap-2">
              <Input readOnly value={iframeSrc} className="font-mono text-caption" aria-label="Iframe URL" />
              <Button variant="outline" onClick={() => onCopy(iframeSrc, "Iframe URL")} aria-label="Copy iframe URL">
                <Copy className="size-4" />
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
