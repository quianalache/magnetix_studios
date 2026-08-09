"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Plus, Share2, Copy, Trash2, ArrowUpRight } from "lucide-react";
import { useSubAccount } from "@/context/sub-account-context";
import { buildDecoderUrl } from "@/lib/domains/public-url";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import type { EmbedConfig } from "@/types/embed-config";

const CARD_BG = ["bg-card", "bg-secondary", "bg-accent/20", "bg-muted"] as const;

/**
 * Embeds — list-first (2026-08-09), replacing the old single anonymous
 * link/iframe card (embed-share-card.tsx). Her direct ask: "a different tab
 * for embed chart, so you could see the different charts that... you
 * created embed codes for."
 *
 * Honest scope: every embed here points at the same real public decoder
 * tool — there's no per-embed chart-design routing or view/submission
 * tracking wired up yet (that's real new plumbing, not built in this
 * pass). What's real: naming and organizing the links you hand out, which
 * is what was actually broken before (one anonymous link, no way to tell
 * two placements apart).
 */
export function EnergeticDecoderEmbedsTab() {
  const { subAccountId, saPath } = useSubAccount();
  const [embeds, setEmbeds] = useState<EmbedConfig[] | null>(null);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [placementNote, setPlacementNote] = useState("");
  const [creating, setCreating] = useState(false);

  function load() {
    fetch(`/api/sub-accounts/${subAccountId}/energetic-decoder/embeds`)
      .then((r) => r.json())
      .then((d) => setEmbeds(d.embeds ?? []))
      .catch(() => toast.error("Couldn't load embeds."));
  }
  useEffect(load, [subAccountId]);

  async function create() {
    setCreating(true);
    try {
      const res = await fetch(`/api/sub-accounts/${subAccountId}/energetic-decoder/embeds`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() || "Untitled embed", placementNote: placementNote.trim() }),
      });
      if (!res.ok) throw new Error();
      toast.success("Embed created.");
      setOpen(false);
      setName("");
      setPlacementNote("");
      load();
    } catch {
      toast.error("Couldn't create embed.");
    } finally {
      setCreating(false);
    }
  }

  async function remove(id: string) {
    setEmbeds((prev) => prev?.filter((e) => e.id !== id) ?? null);
    try {
      const res = await fetch(`/api/sub-accounts/${subAccountId}/energetic-decoder/embeds/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
    } catch {
      toast.error("Couldn't delete.");
      load();
    }
  }

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border bg-card p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">Embeds</h2>
            <p className="text-sm text-muted-foreground">
              Every submission through any of these becomes a saved reading + Contact automatically.
            </p>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground">
              <Plus className="h-3.5 w-3.5" />
              Create new
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>New embed</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="space-y-2">
                  <Label>Name</Label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Instagram Bio Link" />
                </div>
                <div className="space-y-2">
                  <Label>Where it&apos;s going (optional)</Label>
                  <Input value={placementNote} onChange={(e) => setPlacementNote(e.target.value)} placeholder="e.g. magnetixstudios.com footer" />
                </div>
                <Button onClick={create} disabled={creating} className="w-full">
                  {creating ? "Creating…" : "Create embed"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {embeds === null ? (
          <div className="h-24 animate-pulse rounded-xl bg-muted/30" />
        ) : embeds.length === 0 ? (
          <div className="rounded-xl border border-dashed p-8 text-center">
            <Share2 className="mx-auto mb-3 h-8 w-8 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">No embeds yet. Create your first one.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {embeds.map((e, i) => (
              <EmbedRow key={e.id} embed={e} bg={CARD_BG[i % CARD_BG.length]} subAccountId={subAccountId} onDelete={() => remove(e.id)} />
            ))}
          </div>
        )}

        <div className="mt-5 flex items-start gap-2 rounded-xl border border-dashed p-3.5 text-xs text-muted-foreground">
          <span className="mt-0.5 rounded-full bg-muted px-1.5 py-0.5 font-semibold uppercase tracking-wide">Not built yet</span>
          <span>
            View / chart-run counts per embed, and picking a specific Chart Design per embed — both need new tracking + routing that
            doesn&apos;t exist yet. Every embed currently opens the same public tool with your default chart designs.
          </span>
        </div>

        <Button variant="outline" size="sm" className="mt-3" render={<Link href={saPath("/qr-codes")} />}>
          <ArrowUpRight className="mr-1 h-3.5 w-3.5" />
          Generate a QR code (opens QR Codes)
        </Button>
      </div>
    </div>
  );
}

function EmbedRow({
  embed,
  bg,
  subAccountId,
  onDelete,
}: {
  embed: EmbedConfig;
  bg: (typeof CARD_BG)[number];
  subAccountId: string;
  onDelete: () => void;
}) {
  const { subAccount } = useSubAccount();
  const [copied, setCopied] = useState<"link" | "script" | null>(null);

  function url() {
    return buildDecoderUrl({ subAccount, subAccountId });
  }
  function copy(kind: "link" | "script") {
    const text = kind === "link" ? url() : `<iframe src="${url()}" width="100%" height="700" style="border:0;background:transparent"></iframe>`;
    navigator.clipboard.writeText(text);
    setCopied(kind);
    toast.success(kind === "link" ? "Link copied" : "Embed snippet copied");
    setTimeout(() => setCopied(null), 2000);
  }

  return (
    <div className={cn("flex flex-wrap items-center justify-between gap-3 rounded-xl border-none p-4 shadow-sm", bg)}>
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold">{embed.name}</p>
        <p className="truncate text-[11px] text-muted-foreground">{embed.placementNote || "No placement note"}</p>
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <Button size="sm" variant="outline" className="h-7 px-2.5 text-xs" onClick={() => copy("link")}>
          <Copy className="mr-1 h-3 w-3" />
          {copied === "link" ? "Copied" : "Link"}
        </Button>
        <Button size="sm" variant="outline" className="h-7 px-2.5 text-xs" onClick={() => copy("script")}>
          <Copy className="mr-1 h-3 w-3" />
          {copied === "script" ? "Copied" : "Iframe"}
        </Button>
        <button type="button" onClick={onDelete} className="text-muted-foreground hover:text-destructive">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
