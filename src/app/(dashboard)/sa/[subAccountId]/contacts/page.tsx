"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
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
  formFieldOption,
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
import { Alert } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { PageShell } from "@/components/system/page-shell";
import { PageHeader } from "@/components/system/page-header";
import { Pagination } from "@/components/system/pagination";
import { EmptyState as SystemEmptyState } from "@/components/system/empty-state";
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
  const [forms, setForms] = useState<{ id: string; name: string }[]>([]);
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

  const usesForms = rows.conditions.some((r) => r.field === "form");
  useEffect(() => {
    if (!user || !subAccountId || !(moreOpen || usesForms)) return;
    let cancelled = false;
    fetch(`/api/sub-accounts/${subAccountId}/forms`)
      .then((r) => r.json())
      .then((body: { forms?: { id: string; name: string }[] }) => { if (!cancelled) setForms(body.forms ?? []); })
      .catch(() => { if (!cancelled) setForms([]); });
    return () => { cancelled = true; };
  }, [user, subAccountId, moreOpen, usesForms]);

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
      formFieldOption(forms),
    ];
  }, [stages, customFieldDefs, catalog, forms]);

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
    <PageShell width="wide" className="gap-5">
      <Suspense fallback={null}>
        <ImportQueryWatcher onOpen={openImport} />
      </Suspense>

      <PageHeader
        title="Contacts"
        icon={Users}
        accent="crescent"
        description="Everyone in your pipeline, in one place."
        actions={
          <>
          <Button
            variant="outline"
            onClick={() => router.push(saPath("/broadcasts/new"))}
            disabled={noContactsAtAll}
          >
            <Mail className="h-4 w-4" />
            Send bulk email
          </Button>
          {outboundVoiceOn && (
            <Button variant="outline" onClick={() => setBulkCallOpen(true)} disabled={noContactsAtAll}>
              <PhoneOutgoing className="h-4 w-4" />
              Bulk AI call
            </Button>
          )}
          <Button variant="outline" onClick={() => setImportOpen(true)}>
            <Upload className="h-4 w-4" />
            Import CSV
          </Button>
          <Button variant="outline" onClick={handleExport} disabled={noContactsAtAll || exporting}>
            {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            Export
          </Button>
          <AddContactModal onCreated={refresh} />
          </>
        }
      />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => selectList(null)}
            aria-pressed={!activeList}
            className={cn(
              "inline-flex h-(--ds-control-sm) items-center gap-2 rounded-chip border px-3 text-body-sm font-medium transition-colors",
              !activeList
                ? "border-primary bg-tint-violet text-link"
                : "border-border bg-card text-muted-foreground hover:text-foreground",
            )}
          >
            All contacts
            {data && <span className="text-caption tabular-nums opacity-80">{visibleTotal}</span>}
          </button>
          {activeList && (
            <span className="inline-flex h-(--ds-control-sm) items-center gap-1.5 rounded-chip border border-primary bg-tint-violet px-3 text-body-sm font-medium text-link">
              <ListFilter className="h-3.5 w-3.5" />
              {activeList.name}
              {dirty && <span className="text-caption opacity-80">(edited)</span>}
              <button
                type="button"
                onClick={() => selectList(null)}
                className="flex size-6 items-center justify-center rounded-full hover:bg-tag-violet-bg"
                aria-label="Stop viewing this list"
              >
                <X className="h-3 w-3" />
              </button>
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
        <ContactsColumnsMenu
          all={allColumns}
          selected={columnIds}
          onChange={setColumns}
          onReset={resetColumns}
        />
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
      </div>

      <ContactsFilterBar
        search={searchInput}
        onSearch={setSearchInput}
        rows={rows}
        onRowsChange={setRows}
        onOpenMore={() => setMoreOpen(true)}
        sourceChoices={sourceChoices}
        tagSuggestions={tagSuggestions}
      />
      <ActiveFilterChips rows={rows} onRowsChange={setRows} fieldOptions={fieldOptions} />

      {error && !data ? (
        <Alert tone="danger" title="Couldn't load contacts.">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span>{error}</span>
            <Button variant="outline" size="sm" onClick={refresh}>
              <RotateCw className="h-3.5 w-3.5" /> Retry
            </Button>
          </div>
        </Alert>
      ) : !data ? (
        <TableSkeleton />
      ) : noContactsAtAll && !hasFilters ? (
        <EmptyState onImport={() => setImportOpen(true)} onCreated={refresh} />
      ) : pageRows.length === 0 ? (
        <SystemEmptyState
          compact
          icon={SearchX}
          title="No contacts match"
          description="Try a different search or remove a filter."
          action={
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setSearchInput("");
                setRows(EMPTY_ROWS);
                setActiveListId(null);
              }}
            >
              Clear search &amp; filters
            </Button>
          }
        />
      ) : (
        <ContactsTable
          rows={pageRows}
          columns={visibleColumns}
          ctx={columnCtx}
          sort={sort}
          onSort={onSort}
          busy={loading}
          footer={
            <Pagination page={data.page} pageSize={data.pageSize} total={total} onPageChange={setPage} itemLabel={total === 1 ? "contact" : "contacts"} />
          }
        />
      )}
      {error && data && <p className="text-center text-caption text-destructive">{error}</p>}

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
            <div className="flex items-center justify-between gap-2 border-t border-border pt-4 text-body-sm">
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
    </PageShell>
  );
}

function TableSkeleton() {
  return (
    <div className="overflow-hidden rounded-card border border-border bg-card shadow-card" aria-busy="true" aria-label="Loading contacts">
      <div className="h-10 bg-table-head" />
      <div className="divide-y divide-border-subtle">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 px-4 py-3">
            <Skeleton className="size-8 rounded-full" />
            <Skeleton className="h-4 w-40" />
            <Skeleton className="hidden h-4 w-48 sm:block" />
            <Skeleton className="ml-auto h-5 w-16 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

function EmptyState({ onImport, onCreated }: { onImport: () => void; onCreated: () => void }) {
  return (
    <SystemEmptyState
      icon={Users}
      title="No contacts yet"
      description="Add your first lead or import a CSV from your old CRM."
      action={
        <div className="flex flex-wrap justify-center gap-2">
          <AddContactModal onCreated={onCreated} />
          <Button variant="outline" onClick={onImport}>
            <Upload className="h-4 w-4" />
            Import CSV
          </Button>
        </div>
      }
    />
  );
}
