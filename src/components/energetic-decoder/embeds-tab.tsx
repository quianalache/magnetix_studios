"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Eye, Plus, Share2 } from "lucide-react";
import { useSubAccount } from "@/context/sub-account-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatusPill, type StatusTone } from "@/components/system/status-pill";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { EmptyState } from "@/components/system/empty-state";
import { DecoderIndexPage } from "@/components/energetic-decoder/decoder-shell";
import { EmbedEditor } from "@/components/energetic-decoder/embed-editor";
import { EMBED_STATUS_LABEL, embedAccessLabel, embedDeliverySummary } from "@/lib/energetic-decoder/embeds";
import type { EmbedConfig } from "@/types/embed-config";

/**
 * Embeds — the Public Reading Tool's configured experiences (Phase 1,
 * 2026-10-19). `?tab=embeds` lists them; `&embed=ID` opens the editor.
 * Counts are lifetime totals and exclude Test records.
 */

export type EmbedWithPlacements = EmbedConfig & { placements: { pageId: string; name: string; published: boolean }[] };

export const EMBED_STATUS_TONE: Record<EmbedConfig["status"], StatusTone> = {
  live: "success",
  draft: "neutral",
  archived: "warning",
};

export function EnergeticDecoderEmbedsTab() {
  const searchParams = useSearchParams();
  const embedId = searchParams.get("embed");
  if (embedId) return <EmbedEditor embedId={embedId} />;
  return <EmbedsList />;
}

export function embedPreviewHref(subAccountId: string, embedId: string, mode: "preview" | "test") {
  return `/decoder/${subAccountId}?embed=${encodeURIComponent(embedId)}&mode=${mode}`;
}

function EmbedsList() {
  const { subAccountId } = useSubAccount();
  const router = useRouter();
  const pathname = usePathname();
  const [embeds, setEmbeds] = useState<EmbedWithPlacements[] | null>(null);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/sub-accounts/${subAccountId}/energetic-decoder/embeds`)
      .then((r) => r.json())
      .then((d) => !cancelled && setEmbeds(d.embeds ?? []))
      .catch(() => toast.error("Couldn't load embeds."));
    return () => {
      cancelled = true;
    };
  }, [subAccountId]);

  const openEditor = (id: string) => router.push(`${pathname}?tab=embeds&embed=${encodeURIComponent(id)}`, { scroll: false });

  async function create() {
    setCreating(true);
    try {
      const res = await fetch(`/api/sub-accounts/${subAccountId}/energetic-decoder/embeds`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() || "Untitled embed" }),
      });
      const data = await res.json();
      if (!res.ok || !data.embed) throw new Error();
      setOpen(false);
      setName("");
      openEditor(data.embed.id);
    } catch {
      toast.error("Couldn't create embed.");
    } finally {
      setCreating(false);
    }
  }

  return (
    <DecoderIndexPage
      icon={Share2}
      title="Embeds"
      description="Each Embed is a complete reading experience — place it on a Pages & Funnels page or install it on any website."
      actions={
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger render={<Button />}>
            <Plus className="size-4" />
            New embed
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>New embed</DialogTitle>
            </DialogHeader>
            <form
              className="space-y-4 py-2"
              onSubmit={(e) => {
                e.preventDefault();
                void create();
              }}
            >
              <div className="space-y-2">
                <Label htmlFor="new-embed-name">Name</Label>
                <Input id="new-embed-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Free Energetic Blueprint" autoFocus />
                <p className="text-caption text-muted-foreground">Only you see this name. It starts as a Draft.</p>
              </div>
              <Button type="submit" disabled={creating} className="w-full">
                {creating ? "Creating…" : "Create and set up"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      }
    >
      {embeds === null ? (
        <div className="h-24 animate-pulse rounded-card bg-muted" />
      ) : embeds.length === 0 ? (
        <EmptyState
          icon={Share2}
          title="No embeds yet"
          description="Create an Embed to put the Public Reading Tool on a Pages & Funnels page or your website."
          className="rounded-card border border-dashed border-border bg-card"
        />
      ) : (
        <div className="overflow-hidden rounded-card border border-border bg-card shadow-card">
          {/* Desktop table */}
          <table className="hidden w-full text-left text-body-sm md:table">
            <thead className="border-b border-border bg-muted/40 text-caption text-muted-foreground">
              <tr>
                <th className="px-4 py-2.5 font-medium">Embed</th>
                <th className="px-3 py-2.5 font-medium">Status</th>
                <th className="px-3 py-2.5 font-medium">Access</th>
                <th className="px-3 py-2.5 font-medium">After submission</th>
                <th className="px-3 py-2.5 font-medium">Placed on</th>
                <th className="px-3 py-2.5 text-right font-medium">Readings</th>
                <th className="px-3 py-2.5 text-right font-medium">Contacts</th>
                <th className="px-4 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {embeds.map((e) => (
                <tr key={e.id} className="cursor-pointer hover:bg-muted/30" onClick={() => openEditor(e.id)}>
                  <td className="max-w-[260px] px-4 py-3">
                    <p className="truncate font-semibold">{e.name}</p>
                    {e.placementNote && <p className="truncate text-caption text-muted-foreground">{e.placementNote}</p>}
                  </td>
                  <td className="px-3 py-3">
                    <StatusPill tone={EMBED_STATUS_TONE[e.status]}>{EMBED_STATUS_LABEL[e.status]}</StatusPill>
                  </td>
                  <td className="px-3 py-3 text-muted-foreground">{embedAccessLabel(e)}</td>
                  <td className="px-3 py-3 text-muted-foreground">{embedDeliverySummary(e)}</td>
                  <td className="px-3 py-3 text-muted-foreground">{placementSummary(e)}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{e.stats.readings.toLocaleString()}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{e.stats.contacts.toLocaleString()}</td>
                  <td className="px-4 py-3 text-right" onClick={(ev) => ev.stopPropagation()}>
                    <a
                      href={embedPreviewHref(subAccountId, e.id, "preview")}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-caption font-medium hover:bg-muted"
                    >
                      <Eye className="size-3.5" />
                      Preview
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {/* Phone cards */}
          <ul className="divide-y divide-border md:hidden">
            {embeds.map((e) => (
              <li key={e.id} className="space-y-2 px-4 py-3.5">
                <button type="button" onClick={() => openEditor(e.id)} className="flex w-full items-start justify-between gap-3 text-left">
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">{e.name}</span>
                    <span className="block truncate text-caption text-muted-foreground">{embedDeliverySummary(e)}</span>
                  </span>
                  <StatusPill tone={EMBED_STATUS_TONE[e.status]}>{EMBED_STATUS_LABEL[e.status]}</StatusPill>
                </button>
                <div className="flex items-center justify-between gap-3 text-caption text-muted-foreground">
                  <span>
                    {e.stats.readings.toLocaleString()} Readings · {e.stats.contacts.toLocaleString()} Contacts · {placementSummary(e)}
                  </span>
                  <a href={embedPreviewHref(subAccountId, e.id, "preview")} target="_blank" rel="noreferrer" className="shrink-0 font-medium text-foreground underline">
                    Preview
                  </a>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
      <p className="text-caption text-muted-foreground">Readings and Contacts are lifetime totals and exclude Test runs.</p>
    </DecoderIndexPage>
  );
}

function placementSummary(e: EmbedWithPlacements): string {
  const live = e.placements.filter((p) => p.published).length;
  if (e.placements.length === 0) return "—";
  return live === e.placements.length
    ? `${live} page${live === 1 ? "" : "s"}`
    : `${e.placements.length} page${e.placements.length === 1 ? "" : "s"} (${live} published)`;
}
