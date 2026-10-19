"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, Code2, Copy, ExternalLink, Eye, FlaskConical, LayoutTemplate, Save, Share2, Trash2 } from "lucide-react";
import { useSubAccount } from "@/context/sub-account-context";
import { buildDecoderUrl } from "@/lib/domains/public-url";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { SettingsSection } from "@/components/system/settings-section";
import { StatusPill } from "@/components/system/status-pill";
import { DecoderEditorialPage } from "@/components/energetic-decoder/decoder-shell";
import { EMBED_STATUS_TONE, embedPreviewHref, type EmbedWithPlacements } from "@/components/energetic-decoder/embeds-tab";
import {
  EMBED_SHOW_LABEL,
  EMBED_SHOW_OPTIONS,
  EMBED_STATUS_LABEL,
  EMBED_VIEW_LABEL,
  EMBED_VIEWS,
  embedCombinationError,
  normalizeEmbedTags,
} from "@/lib/energetic-decoder/embeds";
import type { EmbedConfig, EmbedFieldMode, EmbedNextStep, EmbedStatus } from "@/types/embed-config";

/**
 * The Embed editor (Public Reading Tool, Phase 1). Primary actions first —
 * use it in Pages & Funnels, or install it on a website — then the five
 * groups in the order an owner thinks about them: Access → Form → Reading →
 * After submission → Contact & automation, then More ways to use this.
 */

interface EditorOptions {
  contentSets: { id: string; name: string; isDefault: boolean }[];
  chartDesigns: { id: string; name: string; isDefault: boolean }[];
  courses: { id: string; title: string; published: boolean }[];
  offers: { id: string; title: string; published: boolean }[];
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
        setOptions(d.options);
        setTestRecords(d.testRecords ?? 0);
        setDraft(toDraft(d.embed));
        setTagsText((d.embed.contact.tags as string[]).join(", "));
      })
      .catch(() => toast.error("Couldn't load this embed."));
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
      <DecoderEditorialPage icon={Share2} title="Embed not found">
        <Button variant="outline" onClick={backToList}>
          <ArrowLeft className="size-4" />
          All embeds
        </Button>
      </DecoderEditorialPage>
    );
  }
  if (!embed || !draft || !options) {
    return (
      <DecoderEditorialPage icon={Share2} title="Embed">
        <div className="h-64 animate-pulse rounded-card bg-muted" />
      </DecoderEditorialPage>
    );
  }

  const update = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => (d ? { ...d, [key]: value } : d));
  const embedUrl = `${buildDecoderUrl({ subAccount, subAccountId })}?embed=${encodeURIComponent(embed.id)}`;

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
      toast.success(nextStatus === "live" ? "Embed is live." : "Saved.");
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
    toast.success(`Removed ${data.removed?.readings ?? 0} test reading(s).`);
  }

  async function remove() {
    if (!confirm(`Delete “${embed?.name}”? This can’t be undone.`)) return;
    const res = await fetch(`/api/sub-accounts/${subAccountId}/energetic-decoder/embeds/${embedId}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return toast.error(data.error ?? "Couldn't delete.");
    toast.success("Embed deleted.");
    backToList();
  }

  const copy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copied`);
  };

  const viewAvailable = (v: (typeof EMBED_VIEWS)[number]) => (v === "astrology" ? options.systems.astrology : options.systems.humanDesign);
  const nextStep = draft.afterSubmit.nextStep;

  return (
    <DecoderEditorialPage
      icon={Share2}
      title={embed.name}
      description="Configure the full experience — Pages & Funnels and website installs both use these settings."
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
          All embeds
        </button>
        <div className="flex items-center gap-2">
          <StatusPill tone={EMBED_STATUS_TONE[draft.status]}>{EMBED_STATUS_LABEL[draft.status]}</StatusPill>
          {embed.status !== "live" && (
            <Button size="sm" onClick={() => save("live")} disabled={saving || !!combinationError}>
              Go live
            </Button>
          )}
        </div>
      </div>

      {/* Primary ways to use it */}
      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-card border border-border bg-card p-4 shadow-card">
          <div className="flex items-start gap-3">
            <LayoutTemplate className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
            <div className="min-w-0 space-y-1">
              <p className="font-semibold">Use in Pages &amp; Funnels</p>
              <p className="text-body-sm text-muted-foreground">
                In the page builder, open <strong>Business</strong>, add <strong>Public Reading Tool</strong>, and choose this Embed. No code.
              </p>
              <Link href={saPath("/pages-funnels")} className="inline-flex items-center gap-1 text-body-sm font-medium underline">
                Open Pages &amp; Funnels
                <ExternalLink className="size-3.5" />
              </Link>
            </div>
          </div>
        </div>
        <div className="rounded-card border border-border bg-card p-4 shadow-card">
          <div className="flex items-start gap-3">
            <Code2 className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
            <div className="min-w-0 space-y-1">
              <p className="font-semibold">Install on a website</p>
              <p className="text-body-sm text-muted-foreground">Copy a snippet for any website, or an iframe for builders that only accept iframes.</p>
              <button type="button" onClick={() => setInstallOpen(true)} className="inline-flex items-center gap-1 text-body-sm font-medium underline">
                Get install code
              </button>
            </div>
          </div>
        </div>
      </div>
      {embed.status !== "live" && (
        <p className="text-body-sm text-muted-foreground">
          This Embed is {EMBED_STATUS_LABEL[embed.status].toLowerCase()} — visitors can’t use it until it’s live. Preview and Run a test always work for you.
        </p>
      )}

      <SettingsSection title="Name & status" description="Only you see the name — visitors never do.">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="ee-name">Embed name</Label>
            <Input id="ee-name" value={draft.name} onChange={(e) => update("name", e.target.value)} maxLength={80} />
          </div>
          <div className="space-y-1.5">
            <Label>Status</Label>
            <SegmentedControl
              value={draft.status}
              onChange={(v) => update("status", v)}
              options={(["draft", "live", "archived"] as EmbedStatus[]).map((s) => ({ value: s, label: EMBED_STATUS_LABEL[s] }))}
            />
            <p className="text-caption text-muted-foreground">Archived stops new Readings. Existing Readings and Reading Reports stay available.</p>
          </div>
        </div>
      </SettingsSection>

      <SettingsSection title="1 · Access" description="Who can use this Embed.">
        <p className="text-body-sm">
          <strong>Anyone</strong> with the page or link. Paid Reading access (sold through an Offer) arrives in the next phase.
        </p>
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
              Ask for consent with a checkbox
            </label>
            {draft.form.consent.enabled && (
              <Textarea
                aria-label="Consent text"
                value={draft.form.consent.text}
                onChange={(e) => update("form", { ...draft.form, consent: { ...draft.form.consent, text: e.target.value } })}
                maxLength={400}
                rows={2}
              />
            )}
          </div>
        </div>
      </SettingsSection>

      <SettingsSection title="3 · Reading" description="The words, the look, and which views visitors see.">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Content Set</Label>
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
            <p className="text-caption text-muted-foreground">Blank entries in a custom set use Default’s text, so a Reading is never empty.</p>
          </div>
          <div className="space-y-1.5">
            <Label>Chart Design</Label>
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
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label>Views shown</Label>
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
            <p className="text-caption text-muted-foreground">
              With two or more views, visitors switch between them with tabs. Systems are turned on in Reading Configuration.
            </p>
          </div>
        </div>
      </SettingsSection>

      <SettingsSection title="4 · After submission" description="What the visitor sees and receives.">
        <div className="space-y-5">
          <div className="space-y-1.5">
            <Label>On the page, show</Label>
            <SegmentedControl
              value={draft.afterSubmit.show}
              onChange={(v) => update("afterSubmit", { ...draft.afterSubmit, show: v })}
              options={EMBED_SHOW_OPTIONS.map((o) => ({ value: o, label: EMBED_SHOW_LABEL[o] }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ee-confirm">Message</Label>
            <Input
              id="ee-confirm"
              value={draft.afterSubmit.confirmationMessage}
              onChange={(e) => update("afterSubmit", { ...draft.afterSubmit, confirmationMessage: e.target.value })}
              maxLength={400}
            />
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <label className="flex items-center gap-2 text-body-sm">
              <Switch checked={draft.afterSubmit.myMagnetix} onCheckedChange={(v) => update("afterSubmit", { ...draft.afterSubmit, myMagnetix: v })} />
              Save to MyMagnetix
            </label>
            <label className="flex items-center gap-2 text-body-sm">
              <Switch checked={draft.afterSubmit.email} onCheckedChange={(v) => update("afterSubmit", { ...draft.afterSubmit, email: v })} />
              Email “Your Reading is ready”
            </label>
            <label className="flex items-center gap-2 text-body-sm">
              <Switch checked={draft.afterSubmit.pdf} onCheckedChange={(v) => update("afterSubmit", { ...draft.afterSubmit, pdf: v })} />
              Offer PDF download
            </label>
          </div>
          <div className="space-y-1.5">
            <Label>Reading output</Label>
            <div className="space-y-1 text-body-sm">
              <p>
                <strong>Reading Report</strong> — the standard client-facing page for this Reading, with its PDF.
              </p>
              <p className="text-muted-foreground">A Report Design delivered as a Generated Report arrives with Reading access in the next phase.</p>
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-1.5">
              <Label>Next step button</Label>
              <Select
                value={nextStep.kind}
                onValueChange={(v) => {
                  const kind = v as EmbedNextStep["kind"];
                  const label = kind === "myMagnetix" ? "Open MyMagnetix" : "Continue";
                  const step: EmbedNextStep =
                    kind === "course"
                      ? { kind, courseId: options.courses[0]?.id ?? "", label }
                      : kind === "offer"
                        ? { kind, offerId: options.offers[0]?.id ?? "", label }
                        : kind === "url"
                          ? { kind, url: "https://", label }
                          : kind === "myMagnetix"
                            ? { kind, label }
                            : { kind: "none" };
                  update("afterSubmit", { ...draft.afterSubmit, nextStep: step });
                }}
                items={{ none: "None", myMagnetix: "MyMagnetix", course: "A course", offer: "An Offer", url: "A page or URL" }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  <SelectItem value="myMagnetix">MyMagnetix</SelectItem>
                  <SelectItem value="course" disabled={options.courses.length === 0}>
                    A course
                  </SelectItem>
                  <SelectItem value="offer" disabled={options.offers.length === 0}>
                    An Offer
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
                  onValueChange={(v) => v && update("afterSubmit", { ...draft.afterSubmit, nextStep: { ...nextStep, courseId: v } })}
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
                  onValueChange={(v) => v && update("afterSubmit", { ...draft.afterSubmit, nextStep: { ...nextStep, offerId: v } })}
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
                <Input id="ee-url" value={nextStep.url} onChange={(e) => update("afterSubmit", { ...draft.afterSubmit, nextStep: { ...nextStep, url: e.target.value } })} />
              </div>
            )}
            {nextStep.kind !== "none" && (
              <div className="space-y-1.5">
                <Label htmlFor="ee-step-label">Button label</Label>
                <Input
                  id="ee-step-label"
                  value={nextStep.label}
                  maxLength={40}
                  onChange={(e) => update("afterSubmit", { ...draft.afterSubmit, nextStep: { ...nextStep, label: e.target.value } })}
                />
              </div>
            )}
          </div>
          {combinationError && (
            <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-body-sm text-destructive">
              {combinationError}
            </p>
          )}
        </div>
      </SettingsSection>

      <SettingsSection title="5 · Contact & automation" description="New and returning visitors, in your CRM.">
        <div className="space-y-3 text-body-sm">
          <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
            <li>New visitors become Contacts (source “Energetic Decoder”). Returning visitors are matched by email — their details are never overwritten.</li>
            <li>Every submission creates a Reading and an activity entry on the Contact, including where it came from (page, website, campaign).</li>
            <li>
              Start follow-up from{" "}
              <Link href={saPath("/workflows")} className="font-medium text-foreground underline">
                Workflows
              </Link>{" "}
              with “Contact created” or a tag added below.
            </li>
          </ul>
          <div className="space-y-1.5">
            <Label htmlFor="ee-tags">Tags to add</Label>
            <Input id="ee-tags" value={tagsText} onChange={(e) => setTagsText(e.target.value)} placeholder="e.g. blueprint, free-reading" />
            <p className="text-caption text-muted-foreground">Comma-separated. Added to new and returning Contacts; existing tags are never removed.</p>
          </div>
        </div>
      </SettingsSection>

      <SettingsSection title="More ways to use this">
        <div className="space-y-5 text-body-sm">
          <div className="space-y-1.5">
            <Label>Direct link</Label>
            <div className="flex gap-2">
              <Input readOnly value={embedUrl} className="font-mono text-caption" />
              <Button variant="outline" onClick={() => copy(embedUrl, "Link")} aria-label="Copy direct link">
                <Copy className="size-4" />
              </Button>
            </div>
            <p className="text-caption text-muted-foreground">The tool’s own page — useful for emails and testing. Add utm_ parameters to track a campaign.</p>
          </div>
          <div className="space-y-1.5">
            <Label>Used on</Label>
            {embed.placements.length === 0 ? (
              <p className="text-muted-foreground">Not placed on any Pages &amp; Funnels page yet.</p>
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
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ee-note">Internal note</Label>
            <Input id="ee-note" value={draft.placementNote} onChange={(e) => update("placementNote", e.target.value)} maxLength={200} placeholder="e.g. Homepage hero, spring campaign" />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border px-3 py-2.5">
            <span>
              Test records: <strong>{testRecords}</strong> <span className="text-muted-foreground">(hidden from Readings, Contacts and counts)</span>
            </span>
            <Button size="sm" variant="outline" onClick={cleanupTests} disabled={testRecords === 0}>
              Clean up
            </Button>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-muted-foreground">
              {embed.stats.readings > 0 ? "This Embed has Readings — archive it to stop new ones." : "Delete this Embed permanently."}
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
              ? "Paste where the tool should appear (a custom code / HTML block). It resizes itself and carries the page’s campaign tags (utm_…) into Magnetix."
              : "For builders that only accept an iframe URL or iframe code. Set a generous height — iframes can’t resize themselves."}
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
