"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  ArrowUpDown,
  Copy,
  ExternalLink,
  FileText,
  Image as ImageIcon,
  Layers,
  LayoutGrid,
  Link2,
  List,
  MoreHorizontal,
  Package,
  Pencil,
  Search,
  Tag,
  Trash2,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useSubAccount } from "@/context/sub-account-context";
import { subscribeToProjects } from "@/lib/firestore/projects";
import { subscribeToCourseOffers } from "@/lib/firestore/course-offers";
import { assetsCall, copyText } from "@/lib/client/assets-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { RESOURCE_AREAS, RESOURCE_TYPES } from "@/types/assets";
import {
  EmptyPanel,
  FilterSelect,
  formatDay,
  Initials,
  linkSource,
  Pager,
  StatusPill,
  TagPill,
} from "./assets-ui";
import { ResourceSheet, type RelationOptions, type ResourceRow } from "./resource-sheet";

const PAGE_SIZE = 10;

interface LegacyBundle {
  id: string;
  name: string;
  description: string;
  assetCount: number;
}

function statusOf(r: ResourceRow) {
  switch (r.status) {
    case "active":
      return { tone: "green" as const, label: "Active" };
    case "draft":
      return { tone: "amber" as const, label: "Draft" };
    case "needs update":
      return { tone: "amber" as const, label: "Needs update" };
    case "idea":
      return { tone: "violet" as const, label: "Idea" };
    default:
      return { tone: "gray" as const, label: "Archived" };
  }
}

function sourceLabel(r: ResourceRow): { name: string; kind: string } {
  if (r.sourceKind === "internal") return { name: "Media Library", kind: "Internal file" };
  if (!r.directLink) return { name: "No link", kind: "External link" };
  return { name: linkSource(r.directLink), kind: "External link" };
}

/** Resource Library — resources the team maintains by hand (links, guides, documents). */
export function ResourceLibrary({
  createSignal,
}: {
  /** Bumped by the header's "New Resource" button. */
  createSignal: number;
}) {
  const { user, loading: authLoading } = useAuth();
  const { subAccountId, agencyId, isAdmin } = useSubAccount();
  const [rows, setRows] = useState<ResourceRow[] | null>(null);
  const [bundles, setBundles] = useState<LegacyBundle[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [relations, setRelations] = useState<RelationOptions>({ projects: [], offers: [] });
  const [q, setQ] = useState("");
  const [type, setType] = useState("all");
  const [source, setSource] = useState("all");
  const [area, setArea] = useState("all");
  const [sort, setSort] = useState("updated");
  const [view, setView] = useState<"list" | "grid">("list");
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<ResourceRow | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [deleting, setDeleting] = useState<ResourceRow | null>(null);

  const load = useCallback(async () => {
    try {
      const list = await assetsCall<{ assets: ResourceRow[]; legacyBundles: LegacyBundle[] }>(`/api/sub-accounts/${subAccountId}/assets`);
      setRows(list.assets);
      setBundles(list.legacyBundles ?? []);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    }
  }, [subAccountId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (createSignal > 0) {
      setEditing(null);
      setSheetOpen(true);
    }
  }, [createSignal]);

  // Relationship pickers (existing Projects + Offers) — loaded once for the editor.
  useEffect(() => {
    if (authLoading || !user || !agencyId) return;
    const unsubs = [
      subscribeToProjects({ agencyId, subAccountId }, (l) =>
        setRelations((r) => ({ ...r, projects: l.map((p) => ({ id: p.id, label: p.title })) }))
      ),
      subscribeToCourseOffers(subAccountId, (l) =>
        setRelations((r) => ({ ...r, offers: l.map((o) => ({ id: o.id, label: o.title })) }))
      ),
    ];
    return () => unsubs.forEach((u) => u());
  }, [authLoading, user, agencyId, subAccountId]);

  useEffect(() => setPage(1), [q, type, source, area, sort]);

  const areas = useMemo(
    () => [...new Set([...RESOURCE_AREAS, ...(rows ?? []).map((r) => r.relatedArea).filter((a): a is string => !!a)])],
    [rows]
  );
  const types = useMemo(
    () => [...new Set([...RESOURCE_TYPES, ...(rows ?? []).map((r) => r.type).filter(Boolean)])],
    [rows]
  );

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    const list = (rows ?? []).filter((r) => {
      if (type !== "all" && r.type !== type) return false;
      if (area !== "all" && (r.relatedArea || "") !== area) return false;
      if (source === "internal" && r.sourceKind !== "internal") return false;
      if (source === "external" && r.sourceKind === "internal") return false;
      if (!s) return true;
      return [r.name, r.description, r.type, r.relatedArea, r.internalNotes, ...(r.tags ?? []), sourceLabel(r).name]
        .filter(Boolean)
        .some((x) => String(x).toLowerCase().includes(s));
    });
    return list.sort((a, b) =>
      sort === "name"
        ? a.name.localeCompare(b.name)
        : sort === "created"
          ? (b.createdAt ?? "").localeCompare(a.createdAt ?? "")
          : (b.updatedAt ?? "").localeCompare(a.updatedAt ?? "")
    );
  }, [rows, q, type, area, source, sort]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const shown = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  async function open(r: ResourceRow) {
    if (r.sourceKind === "internal" && r.mediaAssetId) {
      // Open the tab synchronously (popup blockers), then point it at the short-lived URL.
      const win = window.open("", "_blank");
      if (win) win.opener = null;
      try {
        const res = await assetsCall<{ url: string }>(`/api/sub-accounts/${subAccountId}/media-library/${r.mediaAssetId}/url`);
        if (win) win.location.href = res.url;
        else window.location.href = res.url;
      } catch (err) {
        win?.close();
        toast.error((err as Error).message);
      }
      return;
    }
    if (r.directLink) window.open(r.directLink, "_blank", "noopener,noreferrer");
  }

  async function confirmDelete() {
    if (!deleting) return;
    try {
      await assetsCall(`/api/sub-accounts/${subAccountId}/assets/${deleting.id}`, { method: "DELETE" });
      toast.success("Resource deleted");
      setDeleting(null);
      void load();
    } catch (err) {
      toast.error((err as Error).message);
    }
  }

  function RowMenu({ r }: { r: ResourceRow }) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`${r.name} actions`} />}>
          <MoreHorizontal className="h-4 w-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuItem onClick={() => void open(r)}>
            <ExternalLink className="mr-2 h-4 w-4" /> Open
          </DropdownMenuItem>
          {r.sourceKind !== "internal" && r.directLink && (
            <DropdownMenuItem
              onClick={async () => {
                if (await copyText(r.directLink)) toast.success("Link copied");
                else toast.error("Couldn't copy the link");
              }}
            >
              <Copy className="mr-2 h-4 w-4" /> Copy link
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={() => { setEditing(r); setSheetOpen(true); }}>
            <Pencil className="mr-2 h-4 w-4" /> Edit
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setDeleting(r)} className="text-destructive">
            <Trash2 className="mr-2 h-4 w-4" /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }

  function ResourceIcon({ r }: { r: ResourceRow }) {
    const Icon = r.sourceKind === "internal" ? FileText : r.type === "Design Asset" ? ImageIcon : r.type === "Link" ? Link2 : FileText;
    return (
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-violet-500/10 text-violet-600 dark:text-violet-300">
        <Icon className="h-5 w-5" />
      </span>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
        <label className="relative block lg:w-80">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
          <Input id="resources-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search resources by name, type, or keyword…" className="bg-card h-10 pl-9" />
        </label>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
          <FilterSelect id="resources-type" icon={FileText} label="Type" value={type} onChange={setType} options={[{ value: "all", label: "All Types" }, ...types.map((t) => ({ value: t, label: t }))]} />
          <FilterSelect id="resources-source" icon={Layers} label="Source" value={source} onChange={setSource} options={[{ value: "all", label: "All Sources" }, { value: "external", label: "External links" }]} />
          <FilterSelect id="resources-area" icon={Tag} label="Area" value={area} onChange={setArea} options={[{ value: "all", label: "All Areas" }, ...areas.map((a) => ({ value: a, label: a }))]} />
          <FilterSelect id="resources-sort" icon={ArrowUpDown} label="Sort" value={sort} onChange={setSort} options={[{ value: "updated", label: "Sort: Last updated" }, { value: "created", label: "Sort: Newest" }, { value: "name", label: "Sort: Name" }]} />
        </div>
        <div className="bg-card ml-auto hidden h-10 overflow-hidden rounded-xl border sm:flex" role="group" aria-label="View">
          {(
            [
              ["list", List],
              ["grid", LayoutGrid],
            ] as const
          ).map(([v, Icon]) => (
            <button key={v} type="button" aria-pressed={view === v} aria-label={`${v} view`} onClick={() => setView(v)} className={cn("flex w-11 items-center justify-center", view === v ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted")}>
              <Icon className="h-4 w-4" />
            </button>
          ))}
        </div>
      </div>

      <h2 className="text-xl font-bold">
        Resources <span className="text-muted-foreground font-semibold">({filtered.length})</span>
      </h2>

      {error ? (
        <p className="text-destructive text-sm">Couldn&apos;t load resources: {error}</p>
      ) : !rows ? (
        <div className="bg-muted/40 h-64 animate-pulse rounded-2xl border" aria-busy />
      ) : filtered.length === 0 ? (
        <EmptyPanel
          icon={FileText}
          title={rows.length ? "No resources match" : "Add your first resource"}
          body={rows.length ? "Try another search or filter." : "Keep the links, guides and documents your business runs on in one place."}
          action={!rows.length && <Button onClick={() => { setEditing(null); setSheetOpen(true); }}>New Resource</Button>}
        />
      ) : view === "grid" ? (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {shown.map((r) => {
            const st = statusOf(r);
            const src = sourceLabel(r);
            return (
              <li key={r.id} className="bg-card flex flex-col gap-3 rounded-2xl border p-4 shadow-xs">
                <div className="flex items-start gap-3">
                  <ResourceIcon r={r} />
                  <button type="button" onClick={() => void open(r)} className="min-w-0 flex-1 text-left">
                    <span className="block truncate font-semibold hover:underline">{r.name}</span>
                    <span className="text-muted-foreground line-clamp-2 text-sm">{r.description || "—"}</span>
                  </button>
                  <RowMenu r={r} />
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <TagPill label={r.type || "Other"} />
                  {r.relatedArea && <TagPill label={r.relatedArea} />}
                  <StatusPill tone={st.tone}>{st.label}</StatusPill>
                </div>
                <p className="text-muted-foreground mt-auto text-xs">
                  {src.name} · Updated {formatDay(r.updatedAt)}
                  {r.updatedByName ? ` by ${r.updatedByName}` : ""}
                </p>
              </li>
            );
          })}
        </ul>
      ) : (
        <>
          {/* Phones: stacked cards. */}
          <ul className="space-y-3 md:hidden">
            {shown.map((r) => {
              const st = statusOf(r);
              return (
                <li key={r.id} className="bg-card flex items-start gap-3 rounded-2xl border p-4">
                  <ResourceIcon r={r} />
                  <button type="button" onClick={() => void open(r)} className="min-w-0 flex-1 text-left">
                    <span className="block font-semibold">{r.name}</span>
                    <span className="text-muted-foreground line-clamp-2 text-sm">{r.description || "—"}</span>
                    <span className="mt-2 flex flex-wrap gap-1.5">
                      <TagPill label={r.type || "Other"} />
                      <StatusPill tone={st.tone}>{st.label}</StatusPill>
                    </span>
                  </button>
                  <RowMenu r={r} />
                </li>
              );
            })}
          </ul>
          <div className="bg-card hidden overflow-x-auto rounded-2xl border md:block">
            <table className="w-full min-w-[960px] text-sm">
              <thead>
                <tr className="text-muted-foreground border-b text-left text-xs font-semibold tracking-wide uppercase">
                  <th className="px-4 py-3 font-semibold">Resource</th>
                  <th className="px-3 py-3 font-semibold">Type</th>
                  <th className="px-3 py-3 font-semibold">Access / Source</th>
                  <th className="px-3 py-3 font-semibold">Related Area</th>
                  <th className="px-3 py-3 font-semibold">Status</th>
                  <th className="px-3 py-3 font-semibold">Last Updated</th>
                  <th className="px-3 py-3 font-semibold">Updated By</th>
                  <th className="w-12 px-3 py-3" aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => {
                  const st = statusOf(r);
                  const src = sourceLabel(r);
                  return (
                    <tr key={r.id} className="border-b last:border-0">
                      <td className="max-w-[320px] px-4 py-3">
                        <div className="flex items-center gap-3">
                          <ResourceIcon r={r} />
                          <button type="button" onClick={() => void open(r)} className="min-w-0 text-left">
                            <span className="block truncate font-semibold hover:underline">{r.name}</span>
                            <span className="text-muted-foreground line-clamp-2 text-xs">{r.description || "—"}</span>
                          </button>
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <TagPill label={r.type || "Other"} />
                      </td>
                      <td className="px-3 py-3">
                        <span className="block font-medium">{src.name}</span>
                        <span className="text-muted-foreground block text-xs">{src.kind}</span>
                      </td>
                      <td className="px-3 py-3">{r.relatedArea ? <TagPill label={r.relatedArea} /> : <span className="text-muted-foreground">—</span>}</td>
                      <td className="px-3 py-3">
                        <StatusPill tone={st.tone}>{st.label}</StatusPill>
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        <span className="block">{formatDay(r.updatedAt)}</span>
                        {r.updatedByName && <span className="text-muted-foreground block text-xs">by {r.updatedByName}</span>}
                      </td>
                      <td className="px-3 py-3">
                        {r.updatedByName ? <Initials name={r.updatedByName} /> : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="px-3 py-3 text-right">
                        <RowMenu r={r} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      <Pager page={page} pageCount={pageCount} total={filtered.length} pageSize={PAGE_SIZE} noun="resources" onPage={setPage} />

      {bundles.length > 0 && (
        <section aria-labelledby="legacy-bundles" className="space-y-2">
          <h3 id="legacy-bundles" className="flex items-center gap-2 text-sm font-semibold">
            <Package className="h-4 w-4" /> Legacy offer bundles ({bundles.length})
          </h3>
          <p className="text-muted-foreground text-sm">
            Kept from the old Assets tab for reference. Offers are now managed in Courses → Offers and listed under CRM Resources.
          </p>
          <ul className="bg-card divide-y rounded-2xl border">
            {bundles.map((b) => (
              <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
                <span className="font-medium">{b.name}</span>
                <span className="text-muted-foreground text-xs">{b.assetCount} linked {b.assetCount === 1 ? "asset" : "assets"}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <ResourceSheet
        subAccountId={subAccountId}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        resource={editing}
        relations={relations}
        canUpload={isAdmin}
        onSaved={() => void load()}
      />

      <Dialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete “{deleting?.name}”?</DialogTitle>
            <DialogDescription>
              The resource is removed from your library. {deleting?.sourceKind === "internal" ? "Its file stays in your Media Library." : "The link itself isn't affected."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleting(null)}>Cancel</Button>
            <Button variant="destructive" onClick={confirmDelete}>Delete resource</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
