"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  ArrowUpDown,
  BookOpen,
  CalendarCheck,
  Copy,
  ExternalLink,
  FileText,
  Globe,
  GraduationCap,
  Layers,
  LayoutTemplate,
  MoreHorizontal,
  Package,
  RefreshCw,
  Search,
  Tag,
  Users,
  Video,
  X,
  type LucideIcon,
} from "lucide-react";
import { useSubAccount } from "@/context/sub-account-context";
import { assetsCall, copyText } from "@/lib/client/assets-api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { CrmResourceItem, CrmResourceType } from "@/types/media-library";
import { EmptyPanel, FilterSelect, formatDay, Initials, Pager, StatTile, StatusPill, TagPill, type Tone } from "./assets-ui";

const PAGE_SIZE = 10;
const BANNER_KEY = "magnetix.assets.crmBannerDismissed";

const TYPE_META: Record<CrmResourceType, { label: string; plural: string; icon: LucideIcon; tone: Tone }> = {
  course: { label: "Course", plural: "Courses", icon: GraduationCap, tone: "violet" },
  offer: { label: "Offer", plural: "Offers", icon: Tag, tone: "pink" },
  community: { label: "Community", plural: "Communities", icon: Users, tone: "teal" },
  page: { label: "Page", plural: "Pages", icon: LayoutTemplate, tone: "violet" },
  form: { label: "Form", plural: "Forms", icon: FileText, tone: "blue" },
  webinar: { label: "Webinar", plural: "Webinars", icon: Video, tone: "amber" },
  booking_page: { label: "Booking Page", plural: "Booking Pages", icon: CalendarCheck, tone: "green" },
  product: { label: "Product", plural: "Products", icon: Package, tone: "amber" },
  website: { label: "Website", plural: "Websites", icon: Globe, tone: "blue" },
};

/**
 * CRM Resources — read-only references to things already built in
 * Magnetix. Nothing is duplicated: each row is read live from its module
 * and "Open source" goes to where it's managed.
 */
export function CrmResources() {
  const { subAccountId, saPath } = useSubAccount();
  const [data, setData] = useState<{ items: CrmResourceItem[]; counts: Record<CrmResourceType, number>; unavailable: string[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [bannerHidden, setBannerHidden] = useState(true);
  const [q, setQ] = useState("");
  const [type, setType] = useState<"all" | CrmResourceType>("all");
  const [status, setStatus] = useState("all");
  const [sort, setSort] = useState("updated");
  const [page, setPage] = useState(1);

  useEffect(() => {
    assetsCall<NonNullable<typeof data>>(`/api/sub-accounts/${subAccountId}/crm-resources`)
      .then(setData)
      .catch((e) => setError((e as Error).message));
    try {
      setBannerHidden(localStorage.getItem(BANNER_KEY) === "1");
    } catch {
      setBannerHidden(false);
    }
  }, [subAccountId]);

  useEffect(() => setPage(1), [q, type, status, sort]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    const list = (data?.items ?? []).filter((i) => {
      if (type !== "all" && i.type !== type) return false;
      if (status !== "all" && i.status !== status) return false;
      return !s || [i.title, i.description, i.sourceModule, TYPE_META[i.type].label].some((x) => x.toLowerCase().includes(s));
    });
    return list.sort((a, b) => (sort === "name" ? a.title.localeCompare(b.title) : (b.updatedAt ?? "").localeCompare(a.updatedAt ?? "")));
  }, [data, q, type, status, sort]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const shown = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const tiles: CrmResourceType[] = ["course", "offer", "community", "page"];

  function publicHref(i: CrmResourceItem) {
    if (!i.publicUrl) return null;
    return i.publicUrl.startsWith("http") ? i.publicUrl : `${window.location.origin}${i.publicUrl}`;
  }

  function Actions({ i }: { i: CrmResourceItem }) {
    const pub = typeof window !== "undefined" ? publicHref(i) : null;
    return (
      <div className="flex items-center justify-end gap-1">
        <Button variant="secondary" size="sm" render={<Link href={saPath(i.href)} />}>
          Open source
        </Button>
        {i.publicUrl && (
          <DropdownMenu>
            <DropdownMenuTrigger render={<Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`${i.title} actions`} />}>
              <MoreHorizontal className="h-4 w-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onClick={() => pub && window.open(pub, "_blank", "noopener,noreferrer")}>
                <ExternalLink className="mr-2 h-4 w-4" /> View public page
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={async () => {
                  if (pub && (await copyText(pub))) toast.success("Link copied");
                  else toast.error("Couldn't copy the link");
                }}
              >
                <Copy className="mr-2 h-4 w-4" /> Copy public link
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        {/* Keeps "Open source" aligned on rows without a public page. */}
        {!i.publicUrl && <span className="hidden h-8 w-8 md:block" aria-hidden />}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {!bannerHidden && (
        <div className="flex items-start gap-4 rounded-2xl border border-violet-500/20 bg-violet-500/5 p-4 sm:p-5">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-violet-500/10 text-violet-600 dark:text-violet-300">
            <RefreshCw className="h-6 w-6" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="font-semibold">CRM resources sync automatically</h2>
            <p className="text-muted-foreground mt-1 text-sm">
              Courses, offers, communities, pages and other resources from your Magnetix CRM are surfaced here automatically. No need to create
              duplicates — everything stays in sync with your existing records.
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Dismiss"
            onClick={() => {
              setBannerHidden(true);
              try {
                localStorage.setItem(BANNER_KEY, "1");
              } catch {
                /* per-browser convenience only */
              }
            }}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {tiles.map((t) => (
          <StatTile
            key={t}
            icon={TYPE_META[t].icon}
            tone={TYPE_META[t].tone}
            value={data ? data.counts[t] : "–"}
            label={TYPE_META[t].plural}
            active={type === t}
            onClick={() => setType(type === t ? "all" : t)}
          />
        ))}
      </div>

      <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
        <label className="relative block lg:w-80">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
          <Input id="crm-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search CRM resources by name, type, or keyword…" className="bg-card h-10 pl-9" />
        </label>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
          <FilterSelect
            id="crm-type"
            icon={FileText}
            label="Type"
            value={type}
            onChange={(v) => setType(v as typeof type)}
            options={[
              { value: "all", label: "All Types" },
              ...(Object.keys(TYPE_META) as CrmResourceType[]).map((t) => ({ value: t, label: `${TYPE_META[t].plural}${data ? ` (${data.counts[t]})` : ""}` })),
            ]}
          />
          <FilterSelect id="crm-status" icon={Layers} label="Status" value={status} onChange={setStatus} options={[{ value: "all", label: "All Statuses" }, { value: "active", label: "Live / Published" }, { value: "draft", label: "Draft" }, { value: "archived", label: "Archived / Ended" }]} />
          <FilterSelect id="crm-sort" icon={ArrowUpDown} label="Sort" value={sort} onChange={setSort} options={[{ value: "updated", label: "Sort: Last updated" }, { value: "name", label: "Sort: Name" }]} />
        </div>
      </div>

      <h2 className="text-xl font-bold">
        CRM Resources <span className="text-muted-foreground font-semibold">({filtered.length})</span>
      </h2>

      {data?.unavailable.length ? (
        <p className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-2 text-sm text-amber-800 dark:text-amber-200">
          Couldn&apos;t load: {data.unavailable.join(", ")}. The rest is shown below.
        </p>
      ) : null}

      {error ? (
        <p className="text-destructive text-sm">Couldn&apos;t load CRM resources: {error}</p>
      ) : !data ? (
        <div className="bg-muted/40 h-64 animate-pulse rounded-2xl border" aria-busy />
      ) : filtered.length === 0 ? (
        <EmptyPanel icon={BookOpen} title={data.items.length ? "Nothing matches" : "Nothing to show yet"} body={data.items.length ? "Try another search or filter." : "Courses, offers, communities, forms and pages you create in Magnetix appear here automatically."} />
      ) : (
        <>
          <ul className="space-y-3 md:hidden">
            {shown.map((i) => {
              const M = TYPE_META[i.type];
              return (
                <li key={`${i.type}-${i.id}`} className="bg-card space-y-3 rounded-2xl border p-4">
                  <div className="flex items-start gap-3">
                    <span className="bg-primary/10 text-primary flex h-11 w-11 shrink-0 items-center justify-center rounded-xl">
                      <M.icon className="h-5 w-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold">{i.title}</p>
                      <p className="text-muted-foreground line-clamp-2 text-sm">{i.description || i.sourceModule}</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <TagPill label={M.label} />
                    <StatusPill tone={i.status === "active" ? "green" : i.status === "draft" ? "amber" : "gray"}>{i.statusLabel}</StatusPill>
                  </div>
                  <Actions i={i} />
                </li>
              );
            })}
          </ul>
          <div className="bg-card hidden overflow-x-auto rounded-2xl border md:block">
            <table className="w-full min-w-[1000px] text-sm">
              <thead>
                <tr className="text-muted-foreground border-b text-left text-xs font-semibold tracking-wide uppercase">
                  <th className="px-4 py-3 font-semibold">Resource</th>
                  <th className="px-3 py-3 font-semibold">Type</th>
                  <th className="px-3 py-3 font-semibold">Source Module</th>
                  <th className="px-3 py-3 font-semibold">Access / Delivery</th>
                  <th className="px-3 py-3 font-semibold">Status</th>
                  <th className="px-3 py-3 font-semibold">Last Updated</th>
                  <th className="px-3 py-3 font-semibold">Updated By</th>
                  <th className="px-3 py-3" aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {shown.map((i) => {
                  const M = TYPE_META[i.type];
                  return (
                    <tr key={`${i.type}-${i.id}`} className="border-b last:border-0">
                      <td className="max-w-[320px] px-4 py-3">
                        <div className="flex items-center gap-3">
                          <span className="bg-primary/10 text-primary flex h-11 w-11 shrink-0 items-center justify-center rounded-xl">
                            <M.icon className="h-5 w-5" />
                          </span>
                          <div className="min-w-0">
                            <Link href={saPath(i.href)} className="block truncate font-semibold hover:underline">{i.title}</Link>
                            <span className="text-muted-foreground line-clamp-2 text-xs">{i.description || "—"}</span>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3"><TagPill label={M.label} /></td>
                      <td className="px-3 py-3">
                        <span className="flex items-center gap-2">
                          <M.icon className="text-muted-foreground h-4 w-4 shrink-0" />
                          <span>
                            <span className="block font-medium">{i.sourceModule}</span>
                            <span className="text-muted-foreground block text-xs">CRM {M.label}</span>
                          </span>
                        </span>
                      </td>
                      <td className="px-3 py-3"><TagPill label={i.delivery} /></td>
                      <td className="px-3 py-3">
                        <StatusPill tone={i.status === "active" ? "green" : i.status === "draft" ? "amber" : "gray"}>{i.statusLabel}</StatusPill>
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        <span className="block">{formatDay(i.updatedAt)}</span>
                        {i.updatedByName && <span className="text-muted-foreground block text-xs">by {i.updatedByName}</span>}
                      </td>
                      <td className="px-3 py-3">{i.updatedByName ? <Initials name={i.updatedByName} /> : <span className="text-muted-foreground">—</span>}</td>
                      <td className="px-3 py-3"><Actions i={i} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
      <Pager page={page} pageCount={pageCount} total={filtered.length} pageSize={PAGE_SIZE} noun="CRM resources" onPage={setPage} />
    </div>
  );
}
