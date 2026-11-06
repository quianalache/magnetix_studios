"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, ExternalLink, Link2, Loader2, Plus, Star, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AboutRichTextEditor } from "@/components/community/about-rich-text-editor";
import { ImageUpload } from "@/components/community/image-upload";
import { SidebarContentCard } from "@/components/community/sidebar-content-card";
import { GuidelinesCard } from "@/components/community/guidelines-card";
import { SettingsNav } from "@/components/community/settings/settings-nav";
import { Input } from "@/components/ui/input";
import { uploadCommunityImage } from "@/lib/community/upload-image";
import { SIDEBAR_CARDS_MAX, SIDEBAR_CARD_BODY_MAX, SIDEBAR_CARD_BUTTON_LABEL_MAX, SIDEBAR_CARD_HEADING_MAX, SIDEBAR_LINKS_MAX, GUIDELINES_MAX_CHARS } from "@/config/community";
import type { CommunityGroup, CommunitySidebarCard, ResourceLink } from "@/types/community";

function textLength(html: string): number {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().length;
}

function reorder<T>(items: T[], index: number, direction: -1 | 1): T[] {
  const next = [...items];
  const target = index + direction;
  if (target < 0 || target >= next.length) return next;
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

function Preview({ brand, guidelines, links, cards }: { brand: string; guidelines: string; links: ResourceLink[]; cards: CommunitySidebarCard[] }) {
  return (
    <aside className="rounded-2xl border border-border bg-muted/30 p-4 md:sticky md:top-6">
      <div className="flex items-center justify-between border-b border-border pb-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground"><span className="grid h-7 w-7 place-items-center rounded-lg bg-white text-primary"><Star className="h-4 w-4" /></span>Member Home Preview</h2>
        <span className="text-xs text-muted-foreground">Informational</span>
      </div>
      <div className="mt-4 space-y-3">
        <GuidelinesCard guidelinesHtml={guidelines} />
        {links.length > 0 && <div className="rounded-xl border border-border bg-white p-4"><h3 className="flex items-center gap-2 text-sm font-semibold text-foreground"><Link2 className="h-4 w-4" style={{ color: brand }} />Quick Links</h3><div className="mt-3 space-y-2">{links.map((link) => <a key={`${link.label}-${link.url}`} href={link.url} target="_blank" rel="noreferrer" className="flex items-center justify-between gap-2 text-sm font-medium hover:underline" style={{ color: brand }}><span className="truncate">{link.label || link.url}</span><ExternalLink className="h-3.5 w-3.5 shrink-0" /></a>)}</div></div>}
        {cards.map((card) => <SidebarContentCard key={card.id} card={card} brand={brand} />)}
        {!guidelines.trim() && links.length === 0 && cards.length === 0 && <p className="rounded-xl border border-dashed border-border bg-white p-5 text-center text-sm text-muted-foreground">Add Home content to preview it here.</p>}
      </div>
    </aside>
  );
}

export function CommunityHomeWorkspace({ saId, staffGroupId, groupId, group: initialGroup, brand }: { saId: string; staffGroupId?: string; groupId: string; group: CommunityGroup; brand: string }) {
  const [group, setGroup] = useState(initialGroup);
  const [guidelines, setGuidelines] = useState(initialGroup.guidelinesHtml ?? "");
  const [links, setLinks] = useState<ResourceLink[]>(initialGroup.links ?? []);
  const [cards, setCards] = useState<CommunitySidebarCard[]>(initialGroup.sidebarCards ?? []);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const dirty = guidelines !== (group.guidelinesHtml ?? "") || JSON.stringify(links) !== JSON.stringify(group.links ?? []) || JSON.stringify(cards) !== JSON.stringify(group.sidebarCards ?? []);

  function updateLink(index: number, patch: Partial<ResourceLink>) { setLinks((prev) => prev.map((link, i) => i === index ? { ...link, ...patch } : link)); }
  function updateCard(index: number, patch: Partial<CommunitySidebarCard>) { setCards((prev) => prev.map((card, i) => i === index ? { ...card, ...patch } : card)); }
  function discard() { setGuidelines(group.guidelinesHtml ?? ""); setLinks(group.links ?? []); setCards(group.sidebarCards ?? []); }
  async function save() {
    setSaving(true);
    try {
      const res = await fetch(`/api/community/${saId}/${groupId}/settings`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ guidelinesHtml: guidelines, links, sidebarCards: cards }) });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; group?: CommunityGroup; error?: string };
      if (!res.ok || !data.ok || !data.group) throw new Error(data.error ?? "Couldn’t save Community Home");
      setGroup(data.group); setGuidelines(data.group.guidelinesHtml ?? ""); setLinks(data.group.links ?? []); setCards(data.group.sidebarCards ?? []); toast.success("Community Home saved.");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Couldn’t save Community Home"); } finally { setSaving(false); }
  }

  return <div className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h1>Community Home</h1><p className="mt-1 text-sm text-muted-foreground">Customize the Home experience for enrolled members.</p></div><div className="flex items-center gap-2"><button onClick={discard} disabled={!dirty || saving} className="rounded-md border border-border px-3 py-1.5 text-sm font-medium text-foreground disabled:opacity-50">Discard Changes</button><button onClick={() => void save()} disabled={!dirty || saving || uploading} className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-60" style={{ backgroundColor: brand }}>{saving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}Save Changes</button></div></div>
    <div className="grid gap-6 md:grid-cols-[200px_1fr_340px]">
      <SettingsNav brand={brand} active="home" link={{ saId, pretty: false, staffGroupId }} groupSlug={group.slug} />
      <div className="space-y-6">
        <section className="rounded-xl border border-border bg-white p-5"><div><h2 className="text-base font-semibold text-foreground">Community Guidelines</h2><p className="mt-0.5 text-sm text-muted-foreground">Set the expectations and guidelines for your community.</p></div><div className="mt-4"><AboutRichTextEditor value={guidelines} onChange={setGuidelines} disabled={saving} /><p className={`mt-1 text-right text-xs ${textLength(guidelines) > GUIDELINES_MAX_CHARS ? "text-destructive" : "text-muted-foreground"}`}>{textLength(guidelines)}/{GUIDELINES_MAX_CHARS}</p></div></section>
        <section className="rounded-xl border border-border bg-white p-5"><div className="flex items-start justify-between gap-3"><div><h2 className="text-base font-semibold text-foreground">Sidebar Links</h2><p className="mt-0.5 text-sm text-muted-foreground">Add quick links to helpful resources, pages, or external sites.</p></div><button type="button" onClick={() => setLinks((prev) => [...prev, { label: "", url: "" }])} disabled={links.length >= SIDEBAR_LINKS_MAX || saving} className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-3 py-2 text-sm font-semibold text-primary disabled:opacity-50"><Plus className="h-4 w-4" />Add Link</button></div><p className="mt-3 text-xs text-muted-foreground">{links.length}/{SIDEBAR_LINKS_MAX} links</p><div className="mt-3 space-y-2">{links.map((link, index) => <div key={`${index}-${link.url}`} className="grid gap-2 rounded-lg border border-border p-3 sm:grid-cols-[1fr_1.4fr_auto]"><Input value={link.label} placeholder="Label" onChange={(e) => updateLink(index, { label: e.target.value })} /><Input value={link.url} placeholder="/community/... or https://..." onChange={(e) => updateLink(index, { url: e.target.value })} /><div className="flex items-center justify-end gap-1"><button type="button" aria-label="Move link up" onClick={() => setLinks((prev) => reorder(prev, index, -1))} disabled={index === 0 || saving} className="rounded p-1 text-muted-foreground disabled:opacity-30"><ArrowUp className="h-4 w-4" /></button><button type="button" aria-label="Move link down" onClick={() => setLinks((prev) => reorder(prev, index, 1))} disabled={index === links.length - 1 || saving} className="rounded p-1 text-muted-foreground disabled:opacity-30"><ArrowDown className="h-4 w-4" /></button><button type="button" aria-label="Delete link" onClick={() => setLinks((prev) => prev.filter((_, i) => i !== index))} disabled={saving} className="rounded p-1 text-destructive"><Trash2 className="h-4 w-4" /></button></div></div>)}</div></section>
        <section className="rounded-xl border border-border bg-white p-5"><div className="flex items-start justify-between gap-3"><div><h2 className="text-base font-semibold text-foreground">Sidebar Cards</h2><p className="mt-0.5 text-sm text-muted-foreground">Add up to {SIDEBAR_CARDS_MAX} promotional or resource cards. Images are optional.</p></div><button type="button" onClick={() => setCards((prev) => [...prev, { id: `card-${Date.now()}`, heading: "", body: "", imageUrl: null, buttonLabel: "", buttonUrl: "", accentColor: null, order: prev.length }])} disabled={cards.length >= SIDEBAR_CARDS_MAX || saving} className="inline-flex items-center gap-1 rounded-md bg-primary/10 px-3 py-2 text-sm font-semibold text-primary disabled:opacity-50"><Plus className="h-4 w-4" />Add Card</button></div><p className="mt-3 text-xs text-muted-foreground">{cards.length}/{SIDEBAR_CARDS_MAX} cards</p><div className="mt-3 space-y-3">{cards.map((card, index) => <div key={card.id} className="grid gap-3 rounded-lg border border-border p-3 sm:grid-cols-[140px_1fr_auto]"><ImageUpload label="Optional image" value={card.imageUrl} onChange={(url) => updateCard(index, { imageUrl: url })} onUploadingChange={setUploading} onUpload={(file) => uploadCommunityImage(file, saId, groupId, "sidebar-card")} aspect="video" disabled={saving} /><div className="grid gap-2"><Input value={card.heading} placeholder="Card title" maxLength={SIDEBAR_CARD_HEADING_MAX} onChange={(e) => updateCard(index, { heading: e.target.value })} /><textarea value={card.body} placeholder="Short description" maxLength={SIDEBAR_CARD_BODY_MAX} rows={2} onChange={(e) => updateCard(index, { body: e.target.value })} className="min-h-16 rounded-md border border-input bg-background px-3 py-2 text-sm" /><div className="grid gap-2 sm:grid-cols-2"><Input value={card.buttonLabel} placeholder="CTA label" maxLength={SIDEBAR_CARD_BUTTON_LABEL_MAX} onChange={(e) => updateCard(index, { buttonLabel: e.target.value })} /><Input value={card.buttonUrl} placeholder="Destination URL" onChange={(e) => updateCard(index, { buttonUrl: e.target.value })} /></div></div><div className="flex items-start justify-end gap-1"><button type="button" aria-label="Move card up" onClick={() => setCards((prev) => reorder(prev, index, -1))} disabled={index === 0 || saving} className="rounded p-1 text-muted-foreground disabled:opacity-30"><ArrowUp className="h-4 w-4" /></button><button type="button" aria-label="Move card down" onClick={() => setCards((prev) => reorder(prev, index, 1))} disabled={index === cards.length - 1 || saving} className="rounded p-1 text-muted-foreground disabled:opacity-30"><ArrowDown className="h-4 w-4" /></button><button type="button" aria-label="Delete card" onClick={() => setCards((prev) => prev.filter((_, i) => i !== index))} disabled={saving} className="rounded p-1 text-destructive"><Trash2 className="h-4 w-4" /></button></div></div>)}</div></section>
      </div>
      <Preview brand={brand} guidelines={guidelines} links={links} cards={cards} />
    </div>
  </div>;
}
