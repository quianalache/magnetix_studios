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
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/system/empty-state";
import { DecoderIndexPage } from "@/components/energetic-decoder/decoder-shell";
import type { EmbedConfig } from "@/types/embed-config";


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

  const qrLink = (
    <Button variant="outline" render={<Link href={saPath("/qr-codes")} />}>
      <ArrowUpRight className="size-4" />
      Generate a QR code (opens QR Codes)
    </Button>
  );

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

  // v2 (2026-10-16): the standard operational page — header with Create
  // embed, the section tabs, the shared empty state, then the same honest
  // "not built yet" note and the QR Codes link. No new embed functionality.
  return (
    <DecoderIndexPage
      icon={Share2}
      title="Embeds"
      description="Every submission through an embed becomes a saved reading and a Contact automatically."
      actions={
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger render={<Button />}>
            <Plus className="size-4" />
            Create embed
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
      }
    >
      {embeds === null ? (
        <div className="h-24 animate-pulse rounded-card bg-muted" />
      ) : embeds.length === 0 ? (
        <EmptyState
          icon={Share2}
          title="No embeds yet"
          description="Create your first embed to put the public reading tool on your website."
          action={qrLink}
          className="rounded-card border border-dashed border-border bg-card"
        />
      ) : (
        <div className="space-y-4">
          <ul className="divide-y divide-border overflow-hidden rounded-card border border-border bg-card shadow-card">
            {embeds.map((e) => (
              <EmbedRow key={e.id} embed={e} subAccountId={subAccountId} onDelete={() => remove(e.id)} />
            ))}
          </ul>
          {qrLink}
        </div>
      )}

      <Alert tone="info" title="Not built yet">
        View / chart-run counts per embed, and picking a specific Chart Design per embed — both need new tracking + routing that
        doesn&apos;t exist yet. Every embed currently opens the same public tool with your default chart designs.
      </Alert>
    </DecoderIndexPage>
  );
}

function EmbedRow({
  embed,
  subAccountId,
  onDelete,
}: {
  embed: EmbedConfig;
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
    <li className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5 sm:px-5">
      <div className="min-w-0">
        <p className="truncate text-body-sm font-semibold">{embed.name}</p>
        <p className="truncate text-caption text-muted-foreground">{embed.placementNote || "No placement note"}</p>
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
        <button type="button" onClick={onDelete} aria-label={`Delete ${embed.name}`} className="rounded-md p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </li>
  );
}
