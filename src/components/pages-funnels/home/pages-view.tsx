"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FileText, Plus, RefreshCw, SearchX } from "lucide-react";
import { EmptyState } from "@/components/system/empty-state";
import { FilterBar } from "@/components/system/filter-bar";
import { OptionSelect } from "@/components/system/option-select";
import { Pagination } from "@/components/system/pagination";
import { SearchField } from "@/components/system/search-field";
import { useConfirm } from "@/components/system/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PageCard } from "@/components/pages-funnels/home/page-card";
import { useSubAccount } from "@/context/sub-account-context";
import { useAuth } from "@/hooks/use-auth";
import { buildPublishedPageUrl } from "@/lib/domains/public-url";
import { deletePage, duplicatePage } from "@/lib/firestore/pages-funnels";
import {
  clampPage,
  DEFAULT_PAGE_FILTERS,
  describeUse,
  filterPages,
  PAGES_PER_PAGE,
  PAGE_STATUS_LABELS,
  type FunnelFilter,
  type PageFilters,
  type PageFunnelUse,
  type PageSort,
  type PagesLibraryFunnel,
} from "@/lib/pages-funnels/library";
import { PAGE_TYPE_LABELS, type PageDoc, type PageStatus, type PageType } from "@/types/pages-funnels";
import type { LoadState } from "@/components/pages-funnels/home/use-pages-library";

const TYPE_OPTIONS = (Object.keys(PAGE_TYPE_LABELS) as PageType[]).map((t) => ({ value: t, label: PAGE_TYPE_LABELS[t] }));
const STATUS_OPTIONS = (Object.keys(PAGE_STATUS_LABELS) as PageStatus[]).map((s) => ({ value: s, label: PAGE_STATUS_LABELS[s] }));
const SORT_OPTIONS: { value: PageSort; label: string }[] = [
  { value: "updated", label: "Last updated" },
  { value: "name", label: "Name (A–Z)" },
];

export function PagesView({
  pages,
  pagesState,
  funnels,
  usage,
  onCreatePage,
}: {
  pages: PageDoc[];
  pagesState: LoadState;
  funnels: PagesLibraryFunnel[];
  usage: Record<string, PageFunnelUse[]>;
  onCreatePage: () => void;
}) {
  const router = useRouter();
  const { user } = useAuth();
  const { subAccountId, agencyId, subAccount, saPath, isAdmin } = useSubAccount();
  const { confirm, dialog } = useConfirm();
  const [filters, setFilters] = useState<PageFilters>(DEFAULT_PAGE_FILTERS);
  const [pageNo, setPageNo] = useState(1);

  const set = <K extends keyof PageFilters>(key: K, value: PageFilters[K]) => {
    setFilters((f) => ({ ...f, [key]: value }));
    setPageNo(1);
  };

  const funnelOptions = useMemo(
    () => [{ value: "standalone" as FunnelFilter, label: "Not in a funnel" }, ...funnels.map((f) => ({ value: `funnel:${f.id}` as FunnelFilter, label: f.name }))],
    [funnels],
  );
  const filtered = useMemo(() => filterPages(pages, filters, usage), [pages, filters, usage]);
  const current = clampPage(pageNo, filtered.length, PAGES_PER_PAGE);
  const visible = filtered.slice((current - 1) * PAGES_PER_PAGE, current * PAGES_PER_PAGE);
  const filtering = filters.query.trim() !== "" || filters.type !== null || filters.status !== null || filters.funnel !== "all";

  async function copyLink(page: PageDoc) {
    const url = buildPublishedPageUrl({ subAccount, pageId: page.id });
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Live link copied");
    } catch {
      toast.error("Couldn't copy the link. Open the live page and copy it from the address bar.");
    }
  }

  async function duplicate(page: PageDoc) {
    if (!agencyId || !user) return;
    try {
      const id = await duplicatePage({ agencyId, subAccountId }, user.uid, page);
      toast.success("Page duplicated. The copy is a draft.");
      router.push(saPath(`/pages-funnels/${id}/new-builder`));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't duplicate the page.");
    }
  }

  async function remove(page: PageDoc) {
    const uses = usage[page.id] ?? [];
    const ok = await confirm({
      title: `Delete "${page.name}"?`,
      description: uses.length ? (
        <span className="flex flex-col gap-2">
          <span>
            This page is used in {uses.length === 1 ? "a funnel step" : `${uses.length} funnel steps`}. Those steps will have no page until you choose
            another one, and visitors following them will see a missing page.
          </span>
          <span className="flex flex-col gap-0.5 font-medium text-foreground">
            {uses.map((u) => (
              <span key={`${u.funnelId}-${u.stepId}`}>{describeUse(u)}</span>
            ))}
          </span>
          <span>This can&apos;t be undone.</span>
        </span>
      ) : page.status === "published" ? (
        "This page is live. Deleting it takes it offline for visitors, and this can't be undone."
      ) : (
        "This can't be undone."
      ),
      confirmLabel: "Delete page",
      tone: "danger",
    });
    if (!ok) return;
    try {
      await deletePage(page.id);
      toast.success("Page deleted");
    } catch {
      toast.error("Couldn't delete the page. Try again.");
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {dialog}
      <FilterBar
        search={<SearchField value={filters.query} onChange={(v) => set("query", v)} placeholder="Search pages…" aria-label="Search pages" />}
        filters={
          <>
            <OptionSelect aria-label="Page type" className="w-40" value={filters.type} onChange={(v) => set("type", v)} options={TYPE_OPTIONS} noneLabel="All page types" />
            <OptionSelect aria-label="Status" className="w-36" value={filters.status} onChange={(v) => set("status", v)} options={STATUS_OPTIONS} noneLabel="All statuses" />
            <OptionSelect
              aria-label="Funnel"
              className="w-44"
              value={filters.funnel === "all" ? null : filters.funnel}
              onChange={(v) => set("funnel", v ?? "all")}
              options={funnelOptions}
              noneLabel="All funnels"
            />
            <OptionSelect aria-label="Sort by" className="w-40" value={filters.sort} onChange={(v) => set("sort", v ?? "updated")} options={SORT_OPTIONS} />
          </>
        }
      />

      {pagesState === "loading" ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-busy="true" aria-label="Loading pages">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="flex flex-col gap-3 rounded-card border border-border bg-card p-4 shadow-card">
              <Skeleton className="h-5 w-20" />
              <Skeleton className="aspect-[16/10] w-full" />
              <Skeleton className="h-4 w-2/3" />
            </div>
          ))}
        </div>
      ) : pagesState === "error" ? (
        <EmptyState
          icon={RefreshCw}
          title="Couldn't load your pages"
          description="Check your connection, then reload the page."
          action={<Button variant="secondary" onClick={() => window.location.reload()}>Reload</Button>}
        />
      ) : pages.length === 0 ? (
        <EmptyState
          icon={FileText}
          sparks
          title="No pages yet"
          description="Build a landing page, sales page or funnel step. Start blank, from a template, or with AI."
          action={isAdmin ? <Button onClick={onCreatePage}><Plus aria-hidden="true" /> Create page</Button> : undefined}
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={SearchX}
          compact
          title="No pages match"
          description="Try a different search or clear the filters."
          action={filtering ? <Button variant="secondary" onClick={() => { setFilters({ ...DEFAULT_PAGE_FILTERS, sort: filters.sort }); setPageNo(1); }}>Clear filters</Button> : undefined}
        />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {visible.map((page) => (
              <PageCard
                key={page.id}
                page={page}
                uses={usage[page.id] ?? []}
                editHref={saPath(`/pages-funnels/${page.id}/new-builder`)}
                liveUrl={buildPublishedPageUrl({ subAccount, pageId: page.id })}
                canManage={isAdmin}
                onCopyLink={() => void copyLink(page)}
                onDuplicate={() => void duplicate(page)}
                onDelete={() => void remove(page)}
              />
            ))}
          </div>
          <Pagination page={current} pageSize={PAGES_PER_PAGE} total={filtered.length} onPageChange={setPageNo} itemLabel="pages" />
        </>
      )}
    </div>
  );
}
