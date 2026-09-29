"use client";

import { useEffect, useState } from "react";
import { ImageIcon, Loader2, Search } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { Asset } from "@/types/assets";

export function MediaLibraryPicker({ open, onOpenChange, subAccountId, onSelect }: { open: boolean; onOpenChange: (open: boolean) => void; subAccountId: string; onSelect: (media: { url: string; name: string }) => void }) {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetch(`/api/sub-accounts/${subAccountId}/assets`).then((res) => res.ok ? res.json() : Promise.reject(new Error("Unable to load media"))).then((data: { assets?: Asset[] }) => setAssets(data.assets ?? [])).catch(() => setAssets([])).finally(() => setLoading(false));
  }, [open, subAccountId]);
  const filtered = assets.filter((asset) => {
    if (!asset.directLink) return false;
    const needle = query.trim().toLowerCase();
    return !needle || `${asset.name} ${asset.description} ${asset.tags.join(" ")}`.toLowerCase().includes(needle);
  });
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle>Choose from Media Library</DialogTitle><DialogDescription>Select an existing public media asset. Social Planner reuses its approved delivery URL.</DialogDescription></DialogHeader><div className="relative"><Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search media…" className="pl-9" /></div>{loading ? <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div> : filtered.length === 0 ? <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground"><ImageIcon className="mx-auto mb-2 h-6 w-6" />No publishable media found. Add a public image to the Media Library first.</div> : <div className="grid gap-3 sm:grid-cols-2">{filtered.map((asset) => <button key={asset.id} type="button" className="group overflow-hidden rounded-xl border text-left transition hover:border-primary hover:ring-2 hover:ring-primary/20" onClick={() => { onSelect({ url: asset.directLink, name: asset.name }); onOpenChange(false); }}><div className="aspect-video bg-muted">{/* eslint-disable-next-line @next/next/no-img-element */}<img src={asset.directLink} alt="" className="h-full w-full object-cover" /></div><div className="flex items-center justify-between gap-2 p-3"><span className="truncate text-sm font-medium">{asset.name}</span><Button type="button" size="sm" variant="outline" className="pointer-events-none">Use</Button></div></button>)}</div>}</DialogContent></Dialog>;
}
