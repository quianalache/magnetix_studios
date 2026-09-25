"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Download,
  ListFilter,
  Loader2,
  Mail,
  PhoneOutgoing,
  RotateCw,
  SearchX,
  Upload,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { useSubAccount } from "@/context/sub-account-context";
import { usePipelineStages } from "@/hooks/use-pipeline-stages";
import { useEffectiveTerritoryFilter } from "@/hooks/use-effective-territory-filter";
import { useContactTableColumns } from "@/hooks/use-contact-table-columns";
import { subscribeToContacts } from "@/lib/firestore/contacts";
import { subscribeToTerritories } from "@/lib/firestore/territories";
import { safeSubscribe } from "@/lib/firestore/safe-subscribe";
import { serializeCsv, downloadCsv } from "@/lib/csv";
import {
  accessFieldOption,
  customFieldOption,
  KNOWN_SOURCES,
  SOURCE_OPS,
  standardFieldOptions,
  type FieldOption,
} from "@/lib/segmentation/field-options";
import {
  ConditionRowsEditor,
  groupToRows,
  rowsToGroup,
  type ConditionRowsState,
} from "@/components/segmentation/condition-rows-editor";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ContactsTable } from "@/components/contacts/contacts-table";
import { buildContactColumns } from "@/components/contacts/contact-columns";
import { ContactsFilterBar, ActiveFilterChips } from "@/components/contacts/contacts-filter-bar";
import { ContactsColumnsMenu } from "@/components/contacts/contacts-columns-menu";
import { ContactListsMenu } from "@/components/contacts/contact-lists-menu";
import { AddContactModal } from "@/components/contacts/add-contact-modal";
import { ImportContactsDialog } from "@/components/contacts/import-contacts-dialog";
import { BulkCallDialog } from "@/components/contacts/bulk-call-dialog";
import type { Contact } from "@/types/contacts";
import type { TerritoryDoc } from "@/types";
import type { CustomFieldDef } from "@/types/custom-fields";
import type { AccessCatalog } from "@/types/contact-access";
import type { ContactListView } from "@/types/contact-lists";
import type {
  ContactRow,
  ContactSearchResponse,
  ContactSort,
  ContactSortField,
} from "@/types/contact-search";

/**
 * Reads ?import=1 from the URL, opens the import dialog, then strips the
 * param so closing the dialog doesn't get fought by the next render.
 * Wrapped in <Suspense> — useSearchParams() bails out of static rendering.
 */
function ImportQueryWatcher({ onOpen }: { onOpen: () => void }) {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  useEffect(() => {
    if (searchParams.get("import") !== "1") return;
    onOpen();
    const next = new URLSearchParams(searchParams);
    next.delete("import");
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname);
  }, [searchParams, pathname, router, onOpen]);
  return null;
}

const DEFAULT_SORT: ContactSort = { field: "createdAt", dir: "desc" };
const EMPTY_ROWS: ConditionRowsState = { match: "all", conditions: [] };

interface SavedView {
  search: string;
  group: ReturnType<typeof rowsToGroup>;
  sort: ContactSort;
  page: number;
  listId: string | null;
}

/**
 * Contacts list (Contacts redesign, 2026-09-25).
 *
 * Server-side pagination: the browser receives exactly one 25-row page per
 * request from `POST /api/sub-accounts/[id]/contacts/search`, with search,
 * filters (the shared segmentation engine), Contact Lists and sorting all
 * evaluated server-side together — it no longer subscribes to every contact
 * in the sub-account. The current view (search / filters / sort / page /
 * list) is remembered for this browser tab so coming back from a profile
 * lands where you left off.
 */
export default function ContactsPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const { subAccountId, agencyId, subAccount, saPath } = useSubAccount();
  const stages = usePipelineStages();
  const scopingOn = subAccount?.territoryScopingEnabled === true;
  const outboundVoiceOn = subAccount?.outboundVoiceEnabledByAgency === true;
  const viewKey = `ls:contacts-view:${subAccountId}`;

  const [ready, setReady] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<ConditionRowsState>(EMPTY_ROWS);
  const [sort, setSort] = useState<ContactSort>(DEFAULT_SORT);
  // The page belongs to the view it was chosen in: changing the search,
  // filters or sort derives page 1 immediately (no extra request).
  const [pageState, setPageState] = useState<{ page: number; sig: string | null }>({
    page: 1,
    sig: null,
  });
  const [lists, setLists] = useState<ContactListView[]>([]);
  const [activeListId, setActiveListId] = useState<string | null>(null);
  const [data, setData] = useState<ContactSearchResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [moreOpen, setMoreOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [bulkCallOpen, setBulkCallOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [customFieldDefs, setCustomFieldDefs] = useState<CustomFieldDef[]>([]);
  const [territories, setTerritories] = useState<TerritoryDoc[]>([]);
  const [catalog, setCatalog] = useState<AccessCatalog | null>(null);
  const requestId = useRef(0);
  const freshNext = useRef(true);
  const openImport = useCallback(() => setImportOpen(true), []);

  const { columns: columnIds, setColumns, resetColumns } = useContactTableColumns(
    user?.uid,
    subAccountId,
  );

  // Restore this tab's last view once (search / filters / sort / page / list).
  useEffect(() => {
    try {
      const raw = window.sessionStorage.getItem(viewKey);
      if (raw) {
        const saved = JSON.parse(raw) as Partial<SavedView>;
        if (typeof saved.search === "string") {
          setSearchInput(saved.search);
          setSearch(saved.search);
        }
        if (saved.group) setRows(groupToRows(saved.group));
        if (saved.sort) setSort(saved.sort);
        if (typeof saved.page === "number") setPageState({ page: saved.page, sig: null });
        if (typeof saved.listId === "string") setActiveListId(saved.listId);
      }
    } catch {
      // storage unavailable — start fresh
    }
    setReady(true);
  }, [viewKey]);

  // Debounce typing into the server search.
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const group = useMemo(() => rowsToGroup(rows), [rows]);
  const groupKey = JSON.stringify(group);
  const sortKey = `${sort.field}:${sort.dir}`;

  const viewSignature = `${search}|${groupKey}|${sortKey}`;
  const page =
    pageState.sig === null || pageState.sig === viewSignature ? pageState.page : 1;
  const setPage = useCallback(
    (p: number) => setPageState({ page: p, sig: viewSignature }),
    [viewSignature],
  );
  // Pin a restored page to the restored view once it's in place.
  useEffect(() => {
    if (ready && pageState.sig === null) {
      setPageState((prev) => ({ ...prev, sig: viewSignature }));
    }
  }, [ready, pageState.sig, viewSignature]);

  // Persist the view for this tab.
  useEffect(() => {
    if (!ready) return;
    try {
      const view: SavedView = { search, group, sort, page, listId: activeListId };
      window.sessionStorage.setItem(viewKey, JSON.stringify(view));
    } catch {
      // ignore
    }
  }, [ready, viewKey, search, group, sort, page, activeListId]);

  // The page itself.
  useEffect(() => {
    if (!ready || authLoading || !user || !subAccountId) return;
    const id = ++requestId.current;
    const fresh = freshNext.current;
    freshNext.current = false;
    setLoading(true);
    setError(null);
    fetch(`/api/sub-accounts/${subAccountId}/contacts/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ page, search, group, sort, fresh }),
    })
      .then(async (res) => {
        const body = (await res.json().catch(() => ({}))) as ContactSearchResponse & { error?: string };
        if (!res.ok) throw new Error(body.error ?? "Couldn't load contacts.");
        return body;
      })
      .then((body) => {
        if (id !== requestId.current) return;
        setData(body);
        if (body.page !== page) setPage(body.page);
      })
      .catch((err: unknown) => {
        if (id === requestId.current) {
          setError(err instanceof Error ? err.message : "Couldn't load contacts.");
        }
      })
      .finally(() => {
        if (id === requestId.current) setLoading(false);
      });
    // groupKey/sortKey stand in for group/sort (stable string deps).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, authLoading, user, subAccountId, page, search, groupKey, sortKey, refreshNonce]);

  const refresh = useCallback(() => {
    freshNext.current = true;
    setRefreshNonce((n) => n + 1);
  }, []);

  // Contact Lists.
  const loadLists = useCallback(() => {
    if (!subAccountId) return;
    fetch(`/api/sub-accounts/${subAccountId}/contact-lists`)
      .then((r) => r.json())
      .then((body: { lists?: ContactListView[] }) => setLists(body.lists ?? []))
      .catch(() => {});
  }, [subAccountId]);
  useEffect(() => {
    if (user) loadLists();
  }, [user, loadLists]);

  // Custom field definitions (filters + columns).
  useEffect(() => {
    if (!user || !subAccountId) return;
    let cancelled = false;
    fetch(`/api/sub-accounts/${subAccountId}/custom-fields?entity=contact`)
      .then((r) => r.json())
      .then((body: { ok?: boolean; fields?: CustomFieldDef[] }) => {
        if (!cancelled && body.ok && Array.isArray(body.fields)) setCustomFieldDefs(body.fields);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [user, subAccountId]);

  // Access catalog — only when the access filter is (or may be) in use.
  const usesAccess = rows.conditions.some((r) => r.field === "access");
  useEffect(() => {
    if (!user || !subAccountId || catalog || !(moreOpen || usesAccess)) return;
    fetch(`/api/sub-accounts/${subAccountId}/access-catalog`)
      .then((r) => r.json())
      .then((body: AccessCatalog) => setCatalog(body))
      .catch(() => {});
  }, [user, subAccountId, catalog, moreOpen, usesAccess]);

  // Territories for the Territory column.
  useEffect(() => {
    if (!scopingOn || !subAccountId) {
      setTerritories([]);
      return;
    }
    const unsub = safeSubscribe(
      () => subscribeToTerritories(subAccountId, (list) => setTerritories(list)),
      () => {},
    );
    return () => unsub?.();
  }, [scopingOn, subAccountId]);

  // Bulk AI call still previews against the full contact list — load it
  // ONLY while that dialog is open (never for the list itself).
  const { ready: filterReady, filter: territoryFilter } = useEffectiveTerritoryFilter();
  const [bulkContacts, setBulkContacts] = useState<Contact[]>([]);
  useEffect(() => {
    if (!bulkCallOpen || !agencyId || !filterReady) return;
    const unsub = safeSubscribe(
      () =>
        subscribeToContacts({ agencyId, subAccountId }, { territoryFilter }, (list) =>
          setBulkContacts(list),
        ),
      () => {},
    );
    return () => unsub?.();
  }, [bulkCallOpen, agencyId, subAccountId, filterReady, territoryFilter]);

  const activeList = lists.find((l) => l.id === activeListId) ?? null;
  const dirty = !!activeList && JSON.stringify(activeList.group) !== groupKey;

  const fieldOptions = useMemo<FieldOption[]>(() => {
    const standard = standardFieldOptions({ sourceOps: SOURCE_OPS }).map((o) =>
      o.field === "pipelineStage"
        ? { ...o, choices: stages.map((s) => ({ value: s.id, label: s.label })) }
        : o,
    );
    return [
      ...standard,
      ...customFieldDefs.map(customFieldOption),
      accessFieldOption(catalog),
    ];
  }, [stages, customFieldDefs, catalog]);

  const allColumns = useMemo(
    () => buildContactColumns({ showTerritory: scopingOn, customFields: customFieldDefs }),
    [scopingOn, customFieldDefs],
  );
  const visibleColumns = useMemo(
    () => columnIds.map((id) => allColumns.find((c) => c.id === id)).filter((c): c is (typeof allColumns)[number] => !!c),
    [columnIds, allColumns],
  );
  const columnCtx = useMemo(
    () => ({
      stages,
      territoryById: new Map(territories.map((t) => [t.id, t])),
    }),
    [stages, territories],
  );

  const pageRows: ContactRow[] = useMemo(() => data?.contacts ?? [], [data]);
  const tagSuggestions = useMemo(
    () => [...new Set(pageRows.flatMap((r) => r.tags))].sort().slice(0, 30),
    [pageRows],
  );
  const sourceChoices = useMemo(() => {
    const known = new Set(KNOWN_SOURCES.map((s) => s.value));
    const extra = [...new Set(pageRows.map((r) => r.source).filter((s) => s && !known.has(s)))];
    return [...KNOWN_SOURCES, ...extra.map((s) => ({ value: s, label: s }))];
  }, [pageRows]);

  function onSort(field: ContactSortField) {
    setSort((prev) =>
      prev.field === field
        ? { field, dir: prev.dir === "asc" ? "desc" : "asc" }
        : { field, dir: field === "createdAt" || field === "updatedAt" ? "desc" : "asc" },
    );
  }

  function selectList(list: ContactListView | null) {
    setActiveListId(list?.id ?? null);
    setRows(list ? groupToRows(list.group) : EMPTY_ROWS);
  }

  async function handleExport() {
    setExporting(true);
    try {
      const res = await fetch(`/api/sub-accounts/${subAccountId}/contacts/export`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ search, group, sort }),
      });
      const body = (await res.json().catch(() => ({}))) as { contacts?: ContactRow[]; error?: string };
      if (!res.ok) throw new Error(body.error ?? "Couldn't export contacts.");
      const out = body.contacts ?? [];
      if (out.length === 0) {
        toast.error("No contacts to export.");
        return;
      }
      // Original columns first (existing consumers rely on their order),
      // then the fields added by the Contacts redesign.
      const headers = [
        "name", "email", "phone", "company", "source", "tags", "pipelineStage", "createdAt",
        "firstName", "lastName", "address", "city", "state", "postalCode", "country",
      ];
      const csv = serializeCsv(
        headers,
        out.map((c) => ({
          name: c.name,
          email: c.email,
          phone: c.phone,
          company: c.company,
          source: c.source,
          tags: c.tags,
          pipelineStage: c.pipelineStage ?? "",
          createdAt: c.createdAt ?? "",
          firstName: c.firstName,
          lastName: c.lastName,
          address: c.address,
          city: c.city,
          state: c.state,
          postalCode: c.postalCode,
          country: c.country,
        })),
      );
      const stamp = new Date().toISOString().slice(0, 10);
      downloadCsv(`leadstack-contacts-${stamp}.csv`, csv);
      toast.success(`Exported ${out.length} contact${out.length === 1 ? "" : "s"}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't export contacts.");
    } finally {
      setExporting(false);
    }
  }

  const total = data?.total ?? 0;
  const visibleTotal = data?.visibleTotal ?? 0;
  const hasFilters = group.all.length > 0 || !!search;
  const noContactsAtAll = !!data && visibleTotal === 0;

  return (
    <div className="momentum-scope mx-auto w-full max-w-5xl space-y-5 rounded-2xl">
      <Suspense fallback={null}>
        <ImportQueryWatcher onOpen={openImport} />
      </Suspense>

      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Contacts</h1>
          <p className="text-sm text-muted-foreground">Everyone in your pipeline, in one place.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            onClick={() => router.push(saPath("/broadcasts/new"))}
            disabled={noContactsAtAll}
          >
            <Mail className="mr-1 h-4 w-4" />
            Send bulk email
          </Button>
          {outboundVoiceOn && (
            <Button variant="outline" onClick={() => setBulkCallOpen(true)} disabled={noContactsAtAll}>
              <PhoneOutgoing className="mr-1 h-4 w-4" />
              Bulk AI call
            </Button>
          )}
          <Button variant="outline" onClick={() => setImportOpen(true)}>
            <Upload className="mr-1 h-4 w-4" />
            Import CSV
          </Button>
          <Button variant="outline" onClick={handleExport} disabled={noContactsAtAll || exporting}>
            {exporting ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Download className="mr-1 h-4 w-4" />}
            Export
          </Button>
          <AddContactModal onCreated={refresh} />
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => selectList(null)}
            className={cn(
              "inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium transition-colors",
              !activeList ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted",
            )}
          >
            All contacts
            {data && (
              <span className={cn("rounded-full px-1.5 text-xs", !activeList ? "bg-primary-foreground/20" : "bg-muted")}>
                {visibleTotal}
              </span>
            )}
          </button>
          {activeList && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground">
              <ListFilter className="h-3.5 w-3.5" />
              {activeList.name}
              {dirty && <span className="text-xs opacity-80">(edited)</span>}
              <button
                type="button"
                onClick={() => selectList(null)}
                className="rounded-full p-0.5 hover:bg-primary-foreground/20"
                aria-label="Stop viewing this list"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          )}
        </div>
        <ContactListsMenu
          subAccountId={subAccountId}
          lists={lists}
          activeList={activeList}
          currentGroup={group}
          dirty={dirty}
          onSelect={selectList}
          onChanged={(list, deletedId) => {
            loadLists();
            if (deletedId && deletedId === activeListId) setActiveListId(null);
            if (list) {
              setLists((prev) => [...prev.filter((l) => l.id !== list.id), list]);
              setActiveListId(list.id);
            }
          }}
        />
      </div>

      <ContactsFilterBar
        search={searchInput}
        onSearch={setSearchInput}
        rows={rows}
        onRowsChange={setRows}
        onOpenMore={() => setMoreOpen(true)}
        sourceChoices={sourceChoices}
        tagSuggestions={tagSuggestions}
        trailing={
          <ContactsColumnsMenu
            all={allColumns}
            selected={columnIds}
            onChange={setColumns}
            onReset={resetColumns}
          />
        }
      />
      <ActiveFilterChips rows={rows} onRowsChange={setRows} fieldOptions={fieldOptions} />

      {error && !data ? (
        <div className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
          <div className="min-w-0 flex-1">
            <p className="font-medium text-destructive">Couldn&apos;t load contacts.</p>
            <p className="text-muted-foreground">{error}</p>
          </div>
          <Button variant="outline" size="sm" onClick={refresh}>
            <RotateCw className="mr-1 h-3.5 w-3.5" /> Retry
          </Button>
        </div>
      ) : !data ? (
        <TableSkeleton />
      ) : noContactsAtAll && !hasFilters ? (
        <EmptyState onImport={() => setImportOpen(true)} onCreated={refresh} />
      ) : pageRows.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-card/50 p-10 text-center">
          <SearchX className="mx-auto h-6 w-6 text-muted-foreground" />
          <p className="mt-2 text-sm font-medium">No contacts match</p>
          <p className="text-xs text-muted-foreground">Try a different search or remove a filter.</p>
          <Button
            variant="outline"
            size="sm"
            className="mt-4"
            onClick={() => {
              setSearchInput("");
              setRows(EMPTY_ROWS);
              setActiveListId(null);
            }}
          >
            Clear search &amp; filters
          </Button>
        </div>
      ) : (
        <>
          <ContactsTable
            rows={pageRows}
            columns={visibleColumns}
            ctx={columnCtx}
            sort={sort}
            onSort={onSort}
            busy={loading}
          />
          <Pagination
            page={data.page}
            pageCount={data.pageCount}
            total={total}
            pageSize={data.pageSize}
            onPage={setPage}
            loading={loading}
          />
        </>
      )}
      {error && data && <p className="text-center text-xs text-destructive">{error}</p>}

      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>Filters</SheetTitle>
            <SheetDescription>
              Combine any contact fields, dates, and purchases &amp; access. The quick
              filters above edit this same set.
            </SheetDescription>
          </SheetHeader>
          <div className="space-y-4 p-4 pt-0">
            <ConditionRowsEditor
              value={rows}
              onChange={setRows}
              fieldOptions={fieldOptions}
              emptyText="No filters — showing every contact you can see."
            />
            <div className="flex items-center justify-between gap-2 border-t pt-4 text-sm">
              <span className="text-muted-foreground">
                {loading ? "Counting…" : `${total} matching contact${total === 1 ? "" : "s"}`}
              </span>
              <Button onClick={() => setMoreOpen(false)}>Done</Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <ImportContactsDialog
        open={importOpen}
        onOpenChange={(o) => {
          setImportOpen(o);
          if (!o) refresh();
        }}
      />
      {outboundVoiceOn && (
        <BulkCallDialog open={bulkCallOpen} onOpenChange={setBulkCallOpen} contacts={bulkContacts} />
      )}
    </div>
  );
}

function Pagination({
  page,
  pageCount,
  total,
  pageSize,
  onPage,
  loading,
}: {
  page: number;
  pageCount: number;
  total: number;
  pageSize: number;
  onPage: (p: number) => void;
  loading: boolean;
}) {
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  const pages: (number | "…")[] = [];
  const add = (p: number) => {
    if (!pages.includes(p)) pages.push(p);
  };
  add(1);
  if (page > 3) pages.push("…");
  for (let p = Math.max(2, page - 1); p <= Math.min(pageCount - 1, page + 1); p++) add(p);
  if (page < pageCount - 2) pages.push("…");
  if (pageCount > 1) add(pageCount);

  return (
    <nav className="flex flex-col items-center justify-between gap-3 sm:flex-row" aria-label="Pagination">
      <p className="text-sm text-muted-foreground" aria-live="polite">
        Showing {from}–{to} of {total} contact{total === 1 ? "" : "s"}
        {loading && <Loader2 className="ml-2 inline h-3.5 w-3.5 animate-spin" />}
      </p>
      {pageCount > 1 && (
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            onClick={() => onPage(page - 1)}
            disabled={page <= 1}
            aria-label="Previous page"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          {pages.map((p, i) =>
            p === "…" ? (
              <span key={`gap-${i}`} className="px-1.5 text-sm text-muted-foreground">
                …
              </span>
            ) : (
              <Button
                key={p}
                variant={p === page ? "default" : "ghost"}
                size="sm"
                className="h-8 min-w-8 px-2"
                onClick={() => onPage(p)}
                aria-current={p === page ? "page" : undefined}
              >
                {p}
              </Button>
            ),
          )}
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            onClick={() => onPage(page + 1)}
            disabled={page >= pageCount}
            aria-label="Next page"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </nav>
  );
}

function TableSkeleton() {
  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <div className="border-b bg-muted/40 px-4 py-3">
        <div className="h-3 w-24 animate-pulse rounded bg-muted" />
      </div>
      <div className="divide-y">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-4 py-4">
            <div className="h-8 w-8 animate-pulse rounded-full bg-muted" />
            <div className="h-4 w-40 animate-pulse rounded bg-muted" />
            <div className="hidden h-4 w-48 animate-pulse rounded bg-muted sm:block" />
            <div className="ml-auto h-5 w-16 animate-pulse rounded-full bg-muted" />
          </div>
        ))}
      </div>
    </div>
  );
}

function EmptyState({ onImport, onCreated }: { onImport: () => void; onCreated: () => void }) {
  return (
    <div className="rounded-xl border border-dashed bg-card/50 p-12 text-center">
      <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
        <Users className="h-6 w-6 text-primary" />
      </div>
      <h3 className="text-base font-semibold">No contacts yet</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        Add your first lead or import a CSV from your old CRM.
      </p>
      <div className="mt-6 flex justify-center gap-2">
        <AddContactModal onCreated={onCreated} />
        <Button variant="outline" onClick={onImport}>
          <Upload className="mr-1 h-4 w-4" />
          Import CSV
        </Button>
      </div>
    </div>
  );
}
