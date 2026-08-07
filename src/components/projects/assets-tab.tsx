"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ExternalLink, Layers, Link2, Package, Plus, Trash2 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useSubAccount } from "@/context/sub-account-context";
import { subscribeToAffiliateLinks, subscribeToAssets, subscribeToOfferBundles } from "@/lib/firestore/assets";
import { subscribeToContentItems } from "@/lib/firestore/content-items";
import { subscribeToProjects } from "@/lib/firestore/projects";
import { subscribeToGoals } from "@/lib/firestore/growth";
import { subscribeToCourseOffers } from "@/lib/firestore/course-offers";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AssetDialog } from "@/components/projects/asset-dialog";
import { AffiliateLinkDialog } from "@/components/projects/affiliate-link-dialog";
import { cn } from "@/lib/utils";
import type { AffiliateLink, Asset, OfferBundle } from "@/types/assets";
import type { Project } from "@/types/projects";
import type { ContentItemDoc } from "@/types/content-library";
import type { Goal } from "@/types/growth";
import type { CourseOffer } from "@/types/course-offers";

type AssetsSubTab = "assets" | "bundles" | "affiliates";

export function AssetsTab() {
  const { user, loading: authLoading } = useAuth();
  const { subAccountId, agencyId } = useSubAccount();
  const [subTab, setSubTab] = useState<AssetsSubTab>("assets");

  const [assets, setAssets] = useState<Asset[]>([]);
  const [bundles, setBundles] = useState<OfferBundle[]>([]);
  const [affiliates, setAffiliates] = useState<AffiliateLink[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [contentItems, setContentItems] = useState<ContentItemDoc[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [offers, setOffers] = useState<CourseOffer[]>([]);
  const [loading, setLoading] = useState(true);

  const [assetDialogOpen, setAssetDialogOpen] = useState(false);
  const [editAsset, setEditAsset] = useState<Asset | null>(null);
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [editLink, setEditLink] = useState<AffiliateLink | null>(null);
  const [newBundleOpen, setNewBundleOpen] = useState(false);
  const [bundleName, setBundleName] = useState("");

  useEffect(() => {
    if (authLoading || !user || !agencyId) return;
    setLoading(true);
    const scope = { agencyId, subAccountId };
    const flags = { assets: false, bundles: false, affiliates: false, projects: false, content: false, goals: false };
    const settle = () => {
      if (Object.values(flags).every(Boolean)) setLoading(false);
    };
    const subs = [
      subscribeToAssets(scope, (l) => { setAssets(l); flags.assets = true; settle(); }),
      subscribeToOfferBundles(scope, (l) => { setBundles(l); flags.bundles = true; settle(); }),
      subscribeToAffiliateLinks(scope, (l) => { setAffiliates(l); flags.affiliates = true; settle(); }),
      subscribeToProjects(scope, (l) => { setProjects(l); flags.projects = true; settle(); }),
      subscribeToContentItems(scope, (l) => { setContentItems(l); flags.content = true; settle(); }),
      subscribeToGoals(scope, (l) => { setGoals(l); flags.goals = true; settle(); }),
      subscribeToCourseOffers(subAccountId, (l) => setOffers(l)),
    ];
    return () => subs.forEach((u) => u());
  }, [user, agencyId, subAccountId, authLoading]);

  const stats = useMemo(() => {
    const active = assets.filter((a) => a.status === "active").length;
    const leadMagnets = assets.filter((a) => a.type === "Lead Magnet").length;
    const paidProducts = assets.filter((a) => a.includedIn === "sold_standalone").length;
    const membership = assets.filter((a) => a.includedIn === "standard_membership" || a.includedIn === "premium_membership").length;
    return {
      total: assets.length,
      active,
      leadMagnets,
      paidProducts,
      membership,
      bundles: bundles.length,
      affiliates: affiliates.length,
    };
  }, [assets, bundles, affiliates]);

  function openNewAsset() { setEditAsset(null); setAssetDialogOpen(true); }
  function openEditAsset(a: Asset) { setEditAsset(a); setAssetDialogOpen(true); }
  function openNewLink() { setEditLink(null); setLinkDialogOpen(true); }
  function openEditLink(l: AffiliateLink) { setEditLink(l); setLinkDialogOpen(true); }

  async function deleteAsset(a: Asset) {
    if (!confirm(`Delete asset "${a.name}"?`)) return;
    await fetch(`/api/sub-accounts/${subAccountId}/assets/${a.id}`, { method: "DELETE" });
  }
  async function deleteBundle(b: OfferBundle) {
    if (!confirm(`Delete bundle "${b.name}"?`)) return;
    await fetch(`/api/sub-accounts/${subAccountId}/offer-bundles/${b.id}`, { method: "DELETE" });
  }
  async function createBundle() {
    if (!bundleName.trim()) return;
    await fetch(`/api/sub-accounts/${subAccountId}/offer-bundles`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: bundleName.trim() }),
    });
    setBundleName("");
    setNewBundleOpen(false);
    toast.success("Bundle created — add assets to it from the Asset editor once Relations supports it.");
  }

  if (loading) {
    return <div className="h-40 animate-pulse rounded-xl border bg-muted/30" />;
  }

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        <StatCard label="Total Assets" value={stats.total} />
        <StatCard label="Active" value={stats.active} />
        <StatCard label="Lead Magnets" value={stats.leadMagnets} />
        <StatCard label="Paid Products" value={stats.paidProducts} />
        <StatCard label="Membership" value={stats.membership} />
        <StatCard label="Bundles" value={stats.bundles} />
        <StatCard label="Affiliates" value={stats.affiliates} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-lg bg-muted/30 p-1">
          <SubTabButton active={subTab === "assets"} onClick={() => setSubTab("assets")} icon={<Layers className="h-3.5 w-3.5" />} label="Assets" />
          <SubTabButton active={subTab === "bundles"} onClick={() => setSubTab("bundles")} icon={<Package className="h-3.5 w-3.5" />} label="Offer Bundles" />
          <SubTabButton active={subTab === "affiliates"} onClick={() => setSubTab("affiliates")} icon={<Link2 className="h-3.5 w-3.5" />} label="Affiliate Links" />
        </div>
        {subTab === "assets" && (
          <Button onClick={openNewAsset}><Plus className="mr-1 h-4 w-4" />New Asset</Button>
        )}
        {subTab === "bundles" && (
          <Button onClick={() => setNewBundleOpen((v) => !v)}><Plus className="mr-1 h-4 w-4" />New Bundle</Button>
        )}
        {subTab === "affiliates" && (
          <Button onClick={openNewLink}><Plus className="mr-1 h-4 w-4" />New Affiliate Link</Button>
        )}
      </div>

      {subTab === "assets" && (
        assets.length === 0 ? (
          <EmptyState icon={<Layers className="h-6 w-6 text-primary" />} title="No assets yet" desc="PDFs, tools, templates — anything reusable you sell or give away." />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {assets.map((a) => (
              <div key={a.id} className="rounded-xl border bg-card p-4 text-left">
                <div className="mb-2 flex flex-wrap gap-1.5">
                  <span className="rounded-full bg-secondary px-2 py-0.5 text-[10.5px] font-semibold">{a.type || "Untyped"}</span>
                  {a.accessLevel && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10.5px] font-semibold text-primary">{a.accessLevel}</span>}
                </div>
                <button onClick={() => openEditAsset(a)} className="block text-left">
                  <p className="text-[15px] font-semibold hover:underline">{a.name}</p>
                </button>
                {a.linkedOfferId && <RevenueBadge subAccountId={subAccountId} assetId={a.id} />}
                <p className="mt-2 line-clamp-2 text-[12.5px] text-muted-foreground">{a.description || "No description provided."}</p>
                <div className="mt-3 flex items-center justify-between border-t pt-2.5">
                  {a.landingPageLink || a.directLink ? (
                    <a href={a.landingPageLink || a.directLink} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground hover:text-foreground">
                      <ExternalLink className="h-3 w-3" />
                      {a.landingPageLink ? "Landing" : "Direct Link"}
                    </a>
                  ) : <span />}
                  <button onClick={() => deleteAsset(a)}><Trash2 className="h-3.5 w-3.5 text-muted-foreground" /></button>
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {subTab === "bundles" && (
        <div className="space-y-3">
          {newBundleOpen && (
            <div className="flex items-center gap-2 rounded-xl border bg-card p-3">
              <Input value={bundleName} onChange={(e) => setBundleName(e.target.value)} placeholder="Bundle name" onKeyDown={(e) => e.key === "Enter" && createBundle()} />
              <Button size="sm" onClick={createBundle} disabled={!bundleName.trim()}>Create</Button>
            </div>
          )}
          {bundles.length === 0 ? (
            <EmptyState icon={<Package className="h-6 w-6 text-primary" />} title="No bundles found" desc="Group your assets into offer bundles to see exactly what customers receive." />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {bundles.map((b) => (
                <div key={b.id} className="rounded-xl border bg-card p-4">
                  <div className="flex items-start justify-between">
                    <p className="text-[15px] font-semibold">{b.name}</p>
                    <button onClick={() => deleteBundle(b)}><Trash2 className="h-3.5 w-3.5 text-muted-foreground" /></button>
                  </div>
                  <p className="mt-1 text-[12.5px] text-muted-foreground">{b.description || "No description."}</p>
                  <p className="mt-2 text-[11px] text-muted-foreground">{b.assetIds.length} asset{b.assetIds.length === 1 ? "" : "s"}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {subTab === "affiliates" && (
        affiliates.length === 0 ? (
          <EmptyState icon={<Link2 className="h-6 w-6 text-primary" />} title="No affiliate links yet" desc="Tools and products you promote and earn commission on." />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {affiliates.map((l) => (
              <div key={l.id} className="rounded-xl border bg-card p-4">
                <div className="flex items-start justify-between gap-2">
                  <button onClick={() => openEditLink(l)} className="text-left">
                    <p className="text-[15px] font-semibold hover:underline">{l.programName}</p>
                  </button>
                  <span className={cn(
                    "shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-semibold",
                    l.status === "active" ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" : "bg-muted text-muted-foreground",
                  )}>
                    {l.status[0].toUpperCase() + l.status.slice(1)}
                  </span>
                </div>
                <span className="mt-1.5 inline-block rounded-full bg-secondary px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide">{l.category}</span>
                <div className="mt-3 flex gap-2">
                  <a
                    href={l.affiliateLink || "#"}
                    onClick={(e) => { e.preventDefault(); navigator.clipboard.writeText(l.affiliateLink); toast.success("Link copied"); }}
                    className="flex-1 cursor-pointer rounded-lg bg-primary/10 px-3 py-1.5 text-center text-[11px] font-semibold text-primary"
                  >
                    Copy Link
                  </a>
                  {l.affiliateLink && (
                    <a href={l.affiliateLink} target="_blank" rel="noreferrer" className="flex items-center justify-center rounded-lg border px-2">
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        )
      )}

      <AssetDialog
        open={assetDialogOpen}
        onOpenChange={setAssetDialogOpen}
        asset={editAsset}
        projects={projects}
        contentItems={contentItems}
        goals={goals}
        offers={offers}
      />
      <AffiliateLinkDialog open={linkDialogOpen} onOpenChange={setLinkDialogOpen} link={editLink} />
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border bg-card p-3">
      <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1.5 text-xl font-bold tabular-nums">{value}</p>
    </div>
  );
}

function SubTabButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-all",
        active ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {icon}
      {label}
    </button>
  );
}

function EmptyState({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div className="rounded-xl border border-dashed bg-card/50 p-10 text-center">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">{icon}</div>
      <h3 className="text-base font-semibold">{title}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{desc}</p>
    </div>
  );
}

function RevenueBadge({ subAccountId, assetId }: { subAccountId: string; assetId: string }) {
  const [cents, setCents] = useState<number | null>(null);
  useEffect(() => {
    fetch(`/api/sub-accounts/${subAccountId}/assets/${assetId}/revenue`)
      .then((r) => r.json())
      .then((d: { revenueCents: number | null }) => setCents(d.revenueCents))
      .catch(() => {});
  }, [subAccountId, assetId]);
  if (cents === null) return null;
  return (
    <p className="mt-1.5 text-[11.5px] font-semibold text-emerald-600 dark:text-emerald-400">
      ${(cents / 100).toFixed(2)} revenue
    </p>
  );
}
