"use client";

import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { DollarSign, Trash2 } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useSubAccount } from "@/context/sub-account-context";
import { ASSET_ACCESS_LEVELS, ASSET_STATUSES, ASSET_TYPES } from "@/types/assets";
import type { Asset, AssetIncludedIn, AssetStatus } from "@/types/assets";
import type { Project } from "@/types/projects";
import type { ContentItemDoc } from "@/types/content-library";
import type { Goal } from "@/types/growth";
import type { CourseOffer } from "@/types/course-offers";
import { cn } from "@/lib/utils";

type AssetSubTab = "basic" | "access" | "links" | "relations" | "revenue";
const TABS: { id: AssetSubTab; label: string }[] = [
  { id: "basic", label: "Basic" },
  { id: "access", label: "Access" },
  { id: "links", label: "Links" },
  { id: "relations", label: "Relations" },
  { id: "revenue", label: "Revenue" },
];

const selectClass =
  "h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring";

interface AssetDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  asset?: Asset | null;
  projects: Project[];
  contentItems: ContentItemDoc[];
  goals: Goal[];
  offers: CourseOffer[];
}

export function AssetDialog({ open, onOpenChange, asset, projects, contentItems, goals, offers }: AssetDialogProps) {
  const { subAccountId } = useSubAccount();
  const isEdit = !!asset;
  const [tab, setTab] = useState<AssetSubTab>("basic");

  const [name, setName] = useState("");
  const [type, setType] = useState<string>(ASSET_TYPES[0]);
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<AssetStatus>("active");
  const [tags, setTags] = useState("");

  const [accessLevelChoice, setAccessLevelChoice] = useState<string>(ASSET_ACCESS_LEVELS[0]);
  const [customAccessText, setCustomAccessText] = useState("");
  const [includedIn, setIncludedIn] = useState<AssetIncludedIn>(null);

  const [directLink, setDirectLink] = useState("");
  const [communitySafeLink, setCommunitySafeLink] = useState("");
  const [landingPageLink, setLandingPageLink] = useState("");
  const [checkoutLink, setCheckoutLink] = useState("");

  const [linkedProjectId, setLinkedProjectId] = useState("");
  const [linkedContentId, setLinkedContentId] = useState("");
  const [linkedGoalId, setLinkedGoalId] = useState("");
  const [linkedOfferId, setLinkedOfferId] = useState("");
  const [internalNotes, setInternalNotes] = useState("");

  const [revenueCents, setRevenueCents] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTab("basic");
    if (asset) {
      setName(asset.name);
      setType(asset.type || ASSET_TYPES[0]);
      setDescription(asset.description);
      setStatus(asset.status);
      setTags(asset.tags.join(", "));
      if (asset.accessLevel && (ASSET_ACCESS_LEVELS as readonly string[]).includes(asset.accessLevel)) {
        setAccessLevelChoice(asset.accessLevel);
        setCustomAccessText("");
      } else if (asset.accessLevel) {
        setAccessLevelChoice("Custom");
        setCustomAccessText(asset.accessLevel);
      } else {
        setAccessLevelChoice(ASSET_ACCESS_LEVELS[0]);
        setCustomAccessText("");
      }
      setIncludedIn(asset.includedIn);
      setDirectLink(asset.directLink);
      setCommunitySafeLink(asset.communitySafeLink);
      setLandingPageLink(asset.landingPageLink);
      setCheckoutLink(asset.checkoutLink);
      setLinkedProjectId(asset.linkedProjectId ?? "");
      setLinkedContentId(asset.linkedContentId ?? "");
      setLinkedGoalId(asset.linkedGoalId ?? "");
      setLinkedOfferId(asset.linkedOfferId ?? "");
      setInternalNotes(asset.internalNotes);
      setRevenueCents(null);
      if (asset.linkedOfferId) {
        fetch(`/api/sub-accounts/${subAccountId}/assets/${asset.id}/revenue`)
          .then((r) => r.json())
          .then((d: { revenueCents: number | null }) => setRevenueCents(d.revenueCents))
          .catch(() => {});
      }
    } else {
      setName(""); setType(ASSET_TYPES[0]); setDescription(""); setStatus("active"); setTags("");
      setAccessLevelChoice(ASSET_ACCESS_LEVELS[0]); setCustomAccessText(""); setIncludedIn(null);
      setDirectLink(""); setCommunitySafeLink(""); setLandingPageLink(""); setCheckoutLink("");
      setLinkedProjectId(""); setLinkedContentId(""); setLinkedGoalId(""); setLinkedOfferId("");
      setInternalNotes(""); setRevenueCents(null);
    }
  }, [open, asset, subAccountId]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      setTab("basic");
      return;
    }
    const payload = {
      name: name.trim(),
      type,
      description: description.trim(),
      status,
      tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
      accessLevel: accessLevelChoice === "Custom" ? customAccessText.trim() : accessLevelChoice,
      includedIn,
      directLink: directLink.trim(),
      communitySafeLink: communitySafeLink.trim(),
      landingPageLink: landingPageLink.trim(),
      checkoutLink: checkoutLink.trim(),
      linkedProjectId: linkedProjectId || null,
      linkedContentId: linkedContentId || null,
      linkedGoalId: linkedGoalId || null,
      linkedOfferId: linkedOfferId || null,
      internalNotes: internalNotes.trim(),
    };
    setSaving(true);
    try {
      const url = isEdit ? `/api/sub-accounts/${subAccountId}/assets/${asset!.id}` : `/api/sub-accounts/${subAccountId}/assets`;
      const res = await fetch(url, {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error();
      toast.success(isEdit ? "Asset updated" : "Asset created");
      onOpenChange(false);
    } catch {
      toast.error("Couldn't save this asset. Try again.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!asset) return;
    if (!confirm(`Delete asset "${asset.name}"?`)) return;
    setDeleting(true);
    try {
      await fetch(`/api/sub-accounts/${subAccountId}/assets/${asset.id}`, { method: "DELETE" });
      toast.success("Asset deleted");
      onOpenChange(false);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>{isEdit ? "Edit Asset" : "New Asset"}</SheetTitle>
          <SheetDescription>A reusable resource — a PDF, a tool, a piece of content — you can link to projects, goals, and offers.</SheetDescription>
        </SheetHeader>

        <div className="flex gap-1 rounded-lg bg-muted/30 p-1 mx-4">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={cn(
                "flex-1 rounded-md px-2 py-1.5 text-xs font-semibold transition-all",
                tab === t.id ? "bg-background shadow-sm" : "text-muted-foreground",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        <form className="space-y-4 p-4 pt-3" onSubmit={handleSubmit}>
          {tab === "basic" && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="asset-name">Asset Name <span className="text-destructive">*</span></Label>
                <Input id="asset-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Masterclass PDF" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="asset-type">Type</Label>
                <select id="asset-type" value={type} onChange={(e) => setType(e.target.value)} className={selectClass}>
                  {ASSET_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="asset-status">Status</Label>
                <select id="asset-status" value={status} onChange={(e) => setStatus(e.target.value as AssetStatus)} className={selectClass}>
                  {ASSET_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="asset-desc">Description</Label>
                <Textarea id="asset-desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What is this asset for?" rows={3} />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="asset-tags">Tags (comma separated)</Label>
                <Input id="asset-tags" value={tags} onChange={(e) => setTags(e.target.value)} placeholder="e.g. funnel, freebie" />
              </div>
            </div>
          )}

          {tab === "access" && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="asset-access">Access Level</Label>
                <select
                  id="asset-access"
                  value={accessLevelChoice}
                  onChange={(e) => setAccessLevelChoice(e.target.value)}
                  className={selectClass}
                >
                  {ASSET_ACCESS_LEVELS.map((a) => <option key={a} value={a}>{a}</option>)}
                  <option value="Custom">Custom</option>
                </select>
                {accessLevelChoice === "Custom" && (
                  <Input
                    value={customAccessText}
                    onChange={(e) => setCustomAccessText(e.target.value)}
                    placeholder="e.g. VIP, Founding Members"
                  />
                )}
              </div>
              <div className="grid gap-2 sm:grid-cols-3">
                {([
                  ["standard_membership", "In Standard Membership"],
                  ["premium_membership", "In Premium Membership"],
                  ["sold_standalone", "Sold Standalone"],
                ] as const).map(([value, label]) => (
                  <label key={value} className="flex items-center gap-2 text-sm">
                    <input
                      type="radio"
                      name="includedIn"
                      checked={includedIn === value}
                      onChange={() => setIncludedIn(includedIn === value ? null : value)}
                    />
                    {label}
                  </label>
                ))}
              </div>
            </div>
          )}

          {tab === "links" && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="asset-direct">Direct Asset Link</Label>
                <Input id="asset-direct" value={directLink} onChange={(e) => setDirectLink(e.target.value)} placeholder="https://..." />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="asset-community">Community-Safe Link</Label>
                <Input id="asset-community" value={communitySafeLink} onChange={(e) => setCommunitySafeLink(e.target.value)} placeholder="Shared in community" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="asset-landing">Landing Page Link</Label>
                <Input id="asset-landing" value={landingPageLink} onChange={(e) => setLandingPageLink(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="asset-checkout">Checkout Link</Label>
                <Input id="asset-checkout" value={checkoutLink} onChange={(e) => setCheckoutLink(e.target.value)} />
              </div>
            </div>
          )}

          {tab === "relations" && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="asset-project">Link to Project</Label>
                <select id="asset-project" value={linkedProjectId} onChange={(e) => setLinkedProjectId(e.target.value)} className={selectClass}>
                  <option value="">No Project</option>
                  {projects.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="asset-content">Link to Content</Label>
                <select id="asset-content" value={linkedContentId} onChange={(e) => setLinkedContentId(e.target.value)} className={selectClass}>
                  <option value="">No Content</option>
                  {contentItems.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="asset-goal">Link to Goal</Label>
                <select id="asset-goal" value={linkedGoalId} onChange={(e) => setLinkedGoalId(e.target.value)} className={selectClass}>
                  <option value="">No Goal</option>
                  {goals.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="asset-offer">
                  Link to Offer <span className="text-[10.5px] font-semibold uppercase text-primary">New</span>
                </Label>
                <select id="asset-offer" value={linkedOfferId} onChange={(e) => setLinkedOfferId(e.target.value)} className={selectClass}>
                  <option value="">No Offer</option>
                  {offers.map((o) => <option key={o.id} value={o.id}>{o.title}</option>)}
                </select>
                <p className="text-[11px] text-muted-foreground">Not in the original — links this asset to a real Course Offer so Revenue below tracks actual purchases.</p>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="asset-notes">Internal Notes</Label>
                <Textarea id="asset-notes" value={internalNotes} onChange={(e) => setInternalNotes(e.target.value)} placeholder="Usage instructions, related automations..." rows={3} />
              </div>
            </div>
          )}

          {tab === "revenue" && (
            <div className="rounded-xl border border-dashed p-8 text-center">
              <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                <DollarSign className="h-5 w-5 text-primary" />
              </div>
              {!linkedOfferId ? (
                <>
                  <p className="text-sm font-semibold">No Revenue Data Yet</p>
                  <p className="mt-1 text-xs text-muted-foreground">Link this asset to an Offer under Relations to track real revenue.</p>
                </>
              ) : revenueCents === null ? (
                <p className="text-sm text-muted-foreground">Loading…</p>
              ) : (
                <>
                  <p className="text-2xl font-bold tabular-nums">${(revenueCents / 100).toFixed(2)}</p>
                  <p className="mt-1 text-xs text-muted-foreground">Real revenue from paid purchases of the linked offer.</p>
                </>
              )}
            </div>
          )}

          <div className="flex items-center justify-between gap-2 border-t pt-4">
            {isEdit ? (
              <Button type="button" variant="destructive" size="sm" onClick={handleDelete} disabled={saving || deleting}>
                <Trash2 className="mr-1 h-3.5 w-3.5" />
                {deleting ? "Deleting…" : "Delete"}
              </Button>
            ) : <span />}
            <div className="flex gap-2">
              <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
              <Button type="submit" disabled={saving}>{saving ? "Saving…" : "Save Asset"}</Button>
            </div>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
