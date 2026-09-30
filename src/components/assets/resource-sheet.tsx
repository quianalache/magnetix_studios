"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ChevronDown, FileText, FolderOpen, Layers, Link2, Loader2, Tag, Upload, X } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { assetsCall } from "@/lib/client/assets-api";
import { uploadToMediaLibrary } from "@/lib/client/media-library-upload";
import {
  ASSET_ACCESS_LEVELS,
  ASSET_STATUSES,
  RESOURCE_AREAS,
  RESOURCE_TYPES,
  type Asset,
  type ResourceSourceKind,
} from "@/types/assets";
import type { MediaLibraryItem } from "@/types/media-library";
import { MediaPickerDialog } from "./media-picker-dialog";
import { formatBytes } from "./assets-ui";

export interface ResourceRow extends Omit<Asset, "createdAt" | "updatedAt"> {
  createdAt: string | null;
  updatedAt: string | null;
  updatedByName: string | null;
}

export interface RelationOptions {
  projects: { id: string; label: string }[];
  offers: { id: string; label: string }[];
}

interface Draft {
  name: string;
  type: string;
  sourceKind: ResourceSourceKind;
  directLink: string;
  mediaAssetId: string | null;
  mediaLabel: string | null;
  relatedArea: string;
  customArea: string;
  tags: string[];
  tagInput: string;
  description: string;
  internalNotes: string;
  status: string;
  accessLevel: string;
  linkedProjectId: string;
  linkedOfferId: string;
}

const MAX_TEXT = 500;
const selectCls =
  "border-input bg-background focus-visible:ring-ring/40 h-11 w-full rounded-lg border px-3 text-sm outline-none focus-visible:ring-2";

function blank(): Draft {
  return {
    name: "", type: "Guide", sourceKind: "external", directLink: "", mediaAssetId: null, mediaLabel: null,
    relatedArea: "", customArea: "", tags: [], tagInput: "", description: "", internalNotes: "",
    status: "active", accessLevel: "", linkedProjectId: "", linkedOfferId: "",
  };
}

function fromRow(r: ResourceRow): Draft {
  const area = r.relatedArea ?? "";
  const known = (RESOURCE_AREAS as readonly string[]).includes(area);
  return {
    name: r.name, type: r.type || "Other", sourceKind: r.sourceKind === "internal" ? "internal" : "external",
    directLink: r.directLink || "", mediaAssetId: r.mediaAssetId ?? null, mediaLabel: r.mediaAssetId ? "Linked file" : null,
    relatedArea: known || !area ? area : "__custom", customArea: known ? "" : area, tags: r.tags ?? [], tagInput: "",
    description: r.description || "", internalNotes: r.internalNotes || "", status: r.status || "active",
    accessLevel: r.accessLevel || "", linkedProjectId: r.linkedProjectId ?? "", linkedOfferId: r.linkedOfferId ?? "",
  };
}

/**
 * New / Edit Resource — the approved side panel. Required: name, type,
 * source (external link), related area,
 * description. "More options" keeps the existing status, access-level and
 * project/offer relationships so nothing the old Assets editor stored is
 * lost.
 */
export function ResourceSheet({
  subAccountId,
  open,
  onOpenChange,
  resource,
  relations,
  canUpload,
  onSaved,
}: {
  subAccountId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  resource: ResourceRow | null;
  relations: RelationOptions;
  canUpload: boolean;
  onSaved: () => void;
}) {
  const [d, setD] = useState<Draft>(blank);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [revenueCents, setRevenueCents] = useState<number | null>(null);

  useEffect(() => {
    if (!open) return;
    setD(resource ? fromRow(resource) : blank());
    setMoreOpen(!!(resource?.linkedOfferId || resource?.linkedProjectId));
    setRevenueCents(null);
    // Existing behaviour kept from the old Assets tab: real revenue from the linked offer's paid purchases.
    if (resource?.linkedOfferId) {
      assetsCall<{ revenueCents: number | null }>(`/api/sub-accounts/${subAccountId}/assets/${resource.id}/revenue`)
        .then((r) => setRevenueCents(r.revenueCents))
        .catch(() => setRevenueCents(null));
    }
    if (resource?.mediaAssetId) {
      assetsCall<{ item: MediaLibraryItem }>(`/api/sub-accounts/${subAccountId}/media-library/${resource.mediaAssetId}`)
        .then((r) => setD((cur) => ({ ...cur, mediaLabel: `${r.item.title} · ${formatBytes(r.item.sizeBytes)}` })))
        .catch(() => setD((cur) => ({ ...cur, mediaLabel: "File no longer available" })));
    }
  }, [open, resource, subAccountId]);

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((cur) => ({ ...cur, [k]: v }));

  function addTag(raw: string) {
    const t = raw.trim().replace(/,$/, "").slice(0, 40);
    if (!t || d.tags.includes(t) || d.tags.length >= 20) return set("tagInput", "");
    setD((cur) => ({ ...cur, tags: [...cur.tags, t], tagInput: "" }));
  }

  async function uploadFile(file: File) {
    setUploading(true);
    try {
      const item = await uploadToMediaLibrary(subAccountId, file, { title: d.name || file.name });
      setD((cur) => ({ ...cur, mediaAssetId: item.id, mediaLabel: `${item.title} · ${formatBytes(item.sizeBytes)}` }));
      toast.success("Uploaded to your Media Library");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setUploading(false);
    }
  }

  const area = d.relatedArea === "__custom" ? d.customArea.trim() : d.relatedArea;
  const missing =
    !d.name.trim()
      ? "Give the resource a name."
      : d.sourceKind === "external" && (d.directLink.trim() || !resource) && !/^https?:\/\/\S+\.\S+/.test(d.directLink.trim())
        ? "Add the full link, starting with https://"
        : d.sourceKind === "internal" && !d.mediaAssetId
          ? "Choose or upload the file."
          : !resource && !area
            ? "Choose a related area."
            : !resource && !d.description.trim()
              ? "Add a short description."
              : null;

  async function save() {
    if (missing) {
      toast.error(missing);
      return;
    }
    setSaving(true);
    const body = {
      name: d.name.trim(),
      type: d.type,
      sourceKind: d.sourceKind,
      directLink: d.sourceKind === "external" ? d.directLink.trim() : "",
      mediaAssetId: d.sourceKind === "internal" ? d.mediaAssetId : null,
      relatedArea: area,
      tags: d.tags,
      description: d.description.trim(),
      internalNotes: d.internalNotes.trim(),
      status: d.status,
      accessLevel: d.accessLevel,
      linkedProjectId: d.linkedProjectId || null,
      linkedOfferId: d.linkedOfferId || null,
    };
    try {
      if (resource) await assetsCall(`/api/sub-accounts/${subAccountId}/assets/${resource.id}`, { method: "PATCH", json: body });
      else await assetsCall(`/api/sub-accounts/${subAccountId}/assets`, { method: "POST", json: body });
      toast.success(resource ? "Resource updated" : "Resource saved");
      onSaved();
      onOpenChange(false);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const typeOptions = [...RESOURCE_TYPES, ...(d.type && !(RESOURCE_TYPES as readonly string[]).includes(d.type) ? [d.type] : [])];

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" showCloseButton={false} className="w-full gap-0 overflow-hidden p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-2xl">
        <header className="flex items-start gap-3 border-b px-5 pt-5 pb-4 sm:px-6">
          <span className="bg-primary/10 text-primary flex h-11 w-11 shrink-0 items-center justify-center rounded-full">
            <FileText className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <SheetTitle className="text-xl font-bold">{resource ? "Edit Resource" : "New Resource"}</SheetTitle>
            <SheetDescription className="mt-0.5 text-sm">
              {resource ? "Update this resource's details." : "Add a new resource to your library. This can be an external link or an internal file."}
            </SheetDescription>
          </div>
          <Button variant="ghost" size="icon" onClick={() => onOpenChange(false)} aria-label="Close">
            <X className="h-4 w-4" />
          </Button>
        </header>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-5 sm:px-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="res-name">Resource Name <span className="text-destructive">*</span></Label>
              <Input id="res-name" value={d.name} maxLength={200} placeholder="e.g. Brand Messaging Guide" onChange={(e) => set("name", e.target.value)} className="h-11" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="res-type">Type <span className="text-destructive">*</span></Label>
              <select id="res-type" className={selectCls} value={d.type} onChange={(e) => set("type", e.target.value)}>
                {typeOptions.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
          </div>

          <fieldset className="space-y-2">
            <legend className="mb-2 text-sm font-medium">Source <span className="text-destructive">*</span></legend>
            <div className="grid gap-3 sm:grid-cols-2">
              {([{ v: "external", icon: Link2, label: "External Link", hint: "Link to a file or webpage" }] as const).map((o) => (
                <label
                  key={o.v}
                  className={cn(
                    "flex cursor-pointer items-center gap-3 rounded-xl border p-4 transition-colors",
                    d.sourceKind === o.v ? "border-primary/60 bg-primary/5" : "hover:bg-muted/50"
                  )}
                >
                  <input type="radio" name="res-source" className="accent-primary h-4 w-4" checked={d.sourceKind === o.v} onChange={() => set("sourceKind", o.v)} />
                  <o.icon className="text-muted-foreground h-5 w-5 shrink-0" />
                  <span>
                    <span className="block text-sm font-medium">{o.label}</span>
                    <span className="text-muted-foreground block text-xs">{o.hint}</span>
                  </span>
                </label>
              ))}
              {resource?.sourceKind === "internal" && (
                <div className="flex items-center gap-3 rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
                  <FileText className="h-5 w-5 shrink-0" />
                  <span>Legacy Media Library attachment preserved. New resources use external links.</span>
                </div>
              )}
            </div>
          </fieldset>

          {d.sourceKind === "external" ? (
            <div className="space-y-1.5">
              <Label htmlFor="res-link">Link / File Source <span className="text-destructive">*</span></Label>
              <div className="relative">
                <Link2 className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
                <Input id="res-link" type="url" inputMode="url" value={d.directLink} placeholder="https://…" onChange={(e) => set("directLink", e.target.value)} className="h-11 pl-9" />
              </div>
              <p className="text-muted-foreground text-xs">Add the full URL to the resource (Google Drive, Notion, Canva, etc.)</p>
            </div>
          ) : (
            <div className="space-y-2">
              <Label>File <span className="text-destructive">*</span></Label>
              {d.mediaAssetId ? (
                <div className="flex items-center gap-3 rounded-xl border p-3">
                  <FileText className="text-primary h-5 w-5 shrink-0" />
                  <span className="min-w-0 flex-1 truncate text-sm">{d.mediaLabel ?? "Selected file"}</span>
                  <Button variant="ghost" size="sm" onClick={() => setD((cur) => ({ ...cur, mediaAssetId: null, mediaLabel: null }))}>
                    Change
                  </Button>
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" onClick={() => setPickerOpen(true)}>
                    <FolderOpen className="mr-1.5 h-4 w-4" /> Choose from Media Library
                  </Button>
                  {canUpload && (
                    <label className={cn("border-input hover:bg-muted inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-md border px-3 text-sm font-medium", uploading && "pointer-events-none opacity-60")}>
                      {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                      {uploading ? "Uploading…" : "Upload a file"}
                      <input type="file" className="sr-only" accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.csv,.txt" onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadFile(f); e.target.value = ""; }} />
                    </label>
                  )}
                </div>
              )}
              <p className="text-muted-foreground text-xs">Files stay private to your workspace. Opening one creates a short-lived link.</p>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="res-area">Related Area <span className="text-destructive">*</span></Label>
              <div className="relative">
                <Layers className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
                <select id="res-area" className={cn(selectCls, "pl-9")} value={d.relatedArea} onChange={(e) => set("relatedArea", e.target.value)}>
                  <option value="">Select a related area</option>
                  {RESOURCE_AREAS.map((a) => (
                    <option key={a} value={a}>{a}</option>
                  ))}
                  <option value="__custom">Something else…</option>
                </select>
              </div>
              {d.relatedArea === "__custom" && (
                <Input id="res-area-custom" value={d.customArea} maxLength={60} placeholder="Name the area" onChange={(e) => set("customArea", e.target.value)} />
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="res-tags">Tags</Label>
              <div className="border-input focus-within:ring-ring/40 flex min-h-11 flex-wrap items-center gap-1.5 rounded-lg border px-2 py-1.5 focus-within:ring-2">
                <Tag className="text-muted-foreground ml-1 h-4 w-4" />
                {d.tags.map((t) => (
                  <span key={t} className="bg-muted inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs">
                    {t}
                    <button type="button" aria-label={`Remove ${t}`} onClick={() => set("tags", d.tags.filter((x) => x !== t))}>
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
                <input
                  id="res-tags"
                  value={d.tagInput}
                  placeholder={d.tags.length ? "" : "Add tags…"}
                  onChange={(e) => set("tagInput", e.target.value)}
                  onBlur={() => d.tagInput && addTag(d.tagInput)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === ",") {
                      e.preventDefault();
                      addTag(d.tagInput);
                    } else if (e.key === "Backspace" && !d.tagInput && d.tags.length) set("tags", d.tags.slice(0, -1));
                  }}
                  className="min-w-20 flex-1 bg-transparent text-sm outline-none"
                />
              </div>
              <p className="text-muted-foreground text-xs">Press Enter to add a tag</p>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="res-desc">Description <span className="text-destructive">*</span></Label>
            <Textarea id="res-desc" rows={3} maxLength={MAX_TEXT} value={d.description} placeholder="Briefly describe what this resource is and how it should be used…" onChange={(e) => set("description", e.target.value)} />
            <p className="text-muted-foreground text-right text-xs tabular-nums">{d.description.length}/{MAX_TEXT}</p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="res-notes">Notes <span className="text-muted-foreground font-normal">(Optional)</span></Label>
            <Textarea id="res-notes" rows={3} maxLength={MAX_TEXT} value={d.internalNotes} placeholder="Add any additional notes, context, or usage instructions…" onChange={(e) => set("internalNotes", e.target.value)} />
            <p className="text-muted-foreground text-right text-xs tabular-nums">{d.internalNotes.length}/{MAX_TEXT}</p>
          </div>

          <div className="rounded-xl border">
            <button type="button" onClick={() => setMoreOpen((v) => !v)} aria-expanded={moreOpen} className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium">
              More options
              <ChevronDown className={cn("h-4 w-4 transition-transform", moreOpen && "rotate-180")} />
            </button>
            {moreOpen && (
              <div className="grid gap-4 border-t px-4 py-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="res-status">Status</Label>
                  <select id="res-status" className={selectCls} value={d.status} onChange={(e) => set("status", e.target.value)}>
                    {ASSET_STATUSES.map((s) => (
                      <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="res-access">Access level</Label>
                  <select id="res-access" className={selectCls} value={d.accessLevel} onChange={(e) => set("accessLevel", e.target.value)}>
                    <option value="">Not set</option>
                    {[...ASSET_ACCESS_LEVELS, ...(d.accessLevel && !(ASSET_ACCESS_LEVELS as readonly string[]).includes(d.accessLevel) ? [d.accessLevel] : [])].map((a) => (
                      <option key={a} value={a}>{a}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="res-project">Related project</Label>
                  <select id="res-project" className={selectCls} value={d.linkedProjectId} onChange={(e) => set("linkedProjectId", e.target.value)}>
                    <option value="">None</option>
                    {relations.projects.map((p) => (
                      <option key={p.id} value={p.id}>{p.label}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="res-offer">Related offer</Label>
                  <select id="res-offer" className={selectCls} value={d.linkedOfferId} onChange={(e) => set("linkedOfferId", e.target.value)}>
                    <option value="">None</option>
                    {relations.offers.map((o) => (
                      <option key={o.id} value={o.id}>{o.label}</option>
                    ))}
                  </select>
                  <p className="text-muted-foreground text-xs">
                    {resource && resource.linkedOfferId && d.linkedOfferId === resource.linkedOfferId && revenueCents !== null
                      ? `Revenue from paid purchases: $${(revenueCents / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                      : "Linking an offer shows the revenue from its paid purchases."}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        <footer className="flex items-center justify-between gap-3 border-t px-5 py-4 sm:px-6">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving || uploading}>
            {saving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <FileText className="mr-1.5 h-4 w-4" />}
            {saving ? "Saving…" : "Save Resource"}
          </Button>
        </footer>

        <MediaPickerDialog
          subAccountId={subAccountId}
          open={pickerOpen}
          onOpenChange={setPickerOpen}
          title="Choose a file"
          onSelect={(item) => setD((cur) => ({ ...cur, mediaAssetId: item.id, mediaLabel: `${item.title} · ${formatBytes(item.sizeBytes)}` }))}
        />
      </SheetContent>
    </Sheet>
  );
}
