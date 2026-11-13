"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Copy, MoreHorizontal, Plus, RefreshCw, Tag as TagIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SearchField } from "@/components/system/search-field";
import { OptionSelect } from "@/components/system/option-select";
import { EmptyState } from "@/components/system/empty-state";
import { Tag, tagColorFor } from "@/components/system/status-pill";
import { cn } from "@/lib/utils";
import { tagKey } from "@/lib/contacts/tag-names";
import { TAG_USAGE_TYPES, type TagDuplicateGroup, type TagListResponse, type TagSummary } from "@/types/contact-tags";
import {
  DeleteTagDialog,
  DuplicatesDialog,
  MergeTagsDialog,
  NewTagDialog,
  RenameTagDialog,
} from "./tag-dialogs";
import { TagDetailPanel } from "./tag-detail-panel";
import {
  contactsLabel,
  formatUpdated,
  sortTags,
  TAG_SORT_OPTIONS,
  tagsFetch,
  USAGE_ICONS,
  usageLabel,
  usedInSummary,
  type TagSort,
} from "./tags-client";

/**
 * Contacts → Tags (Contacts & Tags, 2026-11). The central tag library:
 * search, sort, create, and — for workspace admins — rename, merge, delete
 * and duplicate review. Desktop: table, or list + detail side by side once
 * a tag is open. Phones: cards, and the detail on its own screen.
 */
export function TagsLibrary({
  subAccountId,
  selectedId,
  onSelect,
}: {
  subAccountId: string;
  selectedId: string | null;
  onSelect: (tagId: string | null) => void;
}) {
  const [data, setData] = useState<TagListResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<TagSort>("name");
  const [newOpen, setNewOpen] = useState(false);
  const [dupOpen, setDupOpen] = useState(false);
  const [renameTag, setRenameTag] = useState<TagSummary | null>(null);
  const [deleteTag, setDeleteTag] = useState<TagSummary | null>(null);
  const [merge, setMerge] = useState<{ targetId: string | null; sourceIds: string[] } | null>(null);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  useEffect(() => {
    let cancelled = false;
    setError(null);
    tagsFetch<TagListResponse>(subAccountId, "")
      .then((d) => !cancelled && setData(d))
      .catch((err) => !cancelled && setError((err as Error).message));
    return () => {
      cancelled = true;
    };
  }, [subAccountId, nonce]);

  const tags = useMemo(() => data?.tags ?? [], [data]);
  const visible = useMemo(() => {
    const k = tagKey(q);
    return sortTags(k ? tags.filter((t) => tagKey(t.name).includes(k)) : tags, sort);
  }, [tags, q, sort]);
  const canManage = data?.canManage ?? false;

  function openMergeFor(tag: TagSummary) {
    setMerge({ targetId: tag.id, sourceIds: [] });
  }
  function reviewGroup(g: TagDuplicateGroup) {
    const sorted = [...g.tags].sort((a, b) => b.contactCount - a.contactCount);
    setDupOpen(false);
    setMerge({ targetId: sorted[0]?.id ?? null, sourceIds: sorted.slice(1).map((t) => t.id) });
  }

  const rowMenu = (t: TagSummary) => (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="outline" size="icon-sm" aria-label={`Actions for ${t.name}`} onClick={(e) => e.stopPropagation()} />}
      >
        <MoreHorizontal aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44" onClick={(e) => e.stopPropagation()}>
        <DropdownMenuItem onClick={() => onSelect(t.id)}>View details</DropdownMenuItem>
        {canManage ? (
          <>
            <DropdownMenuItem onClick={() => setRenameTag(t)}>Rename</DropdownMenuItem>
            <DropdownMenuItem onClick={() => openMergeFor(t)}>Merge…</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={() => setDeleteTag(t)}>
              Delete…
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const usedInChips = (t: TagSummary) =>
    t.usageCount === 0 ? (
      <span className="text-caption text-muted-foreground">—</span>
    ) : (
      <span className="flex flex-wrap gap-1.5">
        {TAG_USAGE_TYPES.filter((type) => (t.usageByType[type] ?? 0) > 0).map((type) => {
          const Icon = USAGE_ICONS[type];
          return (
            <span key={type} className="inline-flex items-center gap-1 rounded-chip border bg-background px-2 py-0.5 text-caption">
              <Icon className="size-3 text-muted-foreground" aria-hidden="true" />
              {usageLabel(type, t.usageByType[type] ?? 0)}
            </span>
          );
        })}
      </span>
    );

  const toolbar = (
    <div className="flex flex-wrap items-center gap-2">
      <SearchField value={q} onChange={setQ} placeholder="Search tags…" aria-label="Search tags" className="min-w-0 flex-1 basis-56" />
      <OptionSelect<TagSort> aria-label="Sort tags" value={sort} onChange={(v) => v && setSort(v)} options={TAG_SORT_OPTIONS} className="w-44" />
      {data && data.duplicateGroupCount > 0 ? (
        <Button variant="outline" onClick={() => setDupOpen(true)}>
          <Copy aria-hidden="true" /> Possible duplicates ({data.duplicateGroupCount})
        </Button>
      ) : null}
      <Button onClick={() => setNewOpen(true)}>
        <Plus aria-hidden="true" /> New tag
      </Button>
    </div>
  );

  const dialogs = (
    <>
      <NewTagDialog
        subAccountId={subAccountId}
        open={newOpen}
        onOpenChange={setNewOpen}
        onCreated={(tag) => {
          reload();
          onSelect(tag.id);
        }}
        onOpenExisting={(id) => onSelect(id)}
      />
      <RenameTagDialog
        subAccountId={subAccountId}
        tag={renameTag}
        open={!!renameTag}
        onOpenChange={(o) => !o && setRenameTag(null)}
        onRenamed={(id) => {
          reload();
          if (selectedId) onSelect(id);
        }}
        onMergeInstead={(existingId) => setMerge({ targetId: existingId, sourceIds: renameTag ? [renameTag.id] : [] })}
      />
      <MergeTagsDialog
        subAccountId={subAccountId}
        tags={tags}
        open={!!merge}
        onOpenChange={(o) => !o && setMerge(null)}
        initialTargetId={merge?.targetId ?? null}
        initialSourceIds={merge?.sourceIds ?? []}
        onMerged={(keptId) => {
          reload();
          if (selectedId) onSelect(keptId);
        }}
      />
      <DeleteTagDialog
        subAccountId={subAccountId}
        tag={deleteTag}
        open={!!deleteTag}
        onOpenChange={(o) => !o && setDeleteTag(null)}
        onDeleted={() => {
          if (deleteTag && selectedId === deleteTag.id) onSelect(null);
          reload();
        }}
      />
      <DuplicatesDialog
        subAccountId={subAccountId}
        open={dupOpen}
        onOpenChange={setDupOpen}
        canManage={canManage}
        onReviewGroup={reviewGroup}
      />
    </>
  );

  if (error && !data) {
    return (
      <Alert tone="danger" title="Couldn't load tags.">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span>{error}</span>
          <Button variant="outline" size="sm" onClick={reload}>
            <RefreshCw aria-hidden="true" /> Try again
          </Button>
        </div>
      </Alert>
    );
  }

  if (!data) {
    return (
      <div className="flex flex-col gap-3" aria-busy="true">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const emptyLibrary = tags.length === 0;
  const scopedNote = data.countsScoped ? (
    <p className="text-caption text-muted-foreground">Contact counts include only contacts in your territories.</p>
  ) : null;

  // Detail open: list + detail side by side (desktop), detail alone (phones).
  if (selectedId) {
    return (
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <div className="hidden min-w-0 flex-col gap-3 lg:flex">
          <div className="flex flex-wrap items-center gap-2">
            <SearchField value={q} onChange={setQ} placeholder="Search tags…" aria-label="Search tags" className="min-w-0 flex-1" />
            <Button onClick={() => setNewOpen(true)}>
              <Plus aria-hidden="true" /> Add tag
            </Button>
          </div>
          <div className="overflow-hidden rounded-xl border bg-card">
            <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 bg-primary px-4 py-2.5 text-th font-semibold tracking-wide text-primary-foreground uppercase">
              <span>Tag name</span>
              <span>Contacts</span>
            </div>
            <ul className="max-h-[calc(100dvh-20rem)] overflow-y-auto">
              {visible.map((t) => (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(t.id)}
                    aria-current={t.id === selectedId ? "true" : undefined}
                    className={cn(
                      "grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b px-4 py-2.5 text-left text-sm outline-none last:border-b-0 hover:bg-muted/40 focus-visible:bg-muted/60",
                      t.id === selectedId && "bg-tint-violet font-medium",
                    )}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <TagIcon className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                      <span className="truncate">{t.name}</span>
                    </span>
                    <span className="tabular-nums text-muted-foreground">{t.contactCount.toLocaleString()}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
          {scopedNote}
        </div>
        <TagDetailPanel
          key={selectedId}
          subAccountId={subAccountId}
          tagId={selectedId}
          nonce={nonce}
          canManage={canManage}
          onBack={() => onSelect(null)}
          onRename={setRenameTag}
          onMerge={openMergeFor}
          onDelete={setDeleteTag}
        />
        {dialogs}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {toolbar}
      {scopedNote}
      {emptyLibrary ? (
        <EmptyState
          icon={TagIcon}
          title="No tags yet"
          description="Create tags to group contacts, then use them in forms, checkouts, workflows and broadcasts."
          action={
            <Button onClick={() => setNewOpen(true)}>
              <Plus aria-hidden="true" /> New tag
            </Button>
          }
        />
      ) : visible.length === 0 ? (
        <EmptyState compact title="No tags match your search" description="Try a different word, or create the tag." />
      ) : (
        <>
          {/* Desktop / tablet: table. */}
          <div className="hidden overflow-x-auto rounded-xl border bg-card md:block">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="bg-primary text-left text-th font-semibold tracking-wide text-primary-foreground uppercase">
                  <th scope="col" className="px-4 py-3">Tag name</th>
                  <th scope="col" className="px-4 py-3">Contacts</th>
                  <th scope="col" className="px-4 py-3">Used in</th>
                  <th scope="col" className="px-4 py-3">Updated</th>
                  <th scope="col" className="px-4 py-3 text-right">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {visible.map((t) => (
                  <tr
                    key={t.id}
                    onClick={() => onSelect(t.id)}
                    className="cursor-pointer border-b last:border-b-0 hover:bg-muted/40"
                  >
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelect(t.id);
                        }}
                        className="rounded-chip outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                      >
                        <Tag color={tagColorFor(t.name)}>{t.name}</Tag>
                      </button>
                    </td>
                    <td className="px-4 py-3 tabular-nums">{t.contactCount.toLocaleString()}</td>
                    <td className="px-4 py-3">{usedInChips(t)}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-muted-foreground">{formatUpdated(t.updatedAt)}</td>
                    <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                      {rowMenu(t)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* Phones: cards. */}
          <ul className="flex flex-col gap-2 md:hidden">
            {visible.map((t) => (
              <li key={t.id} className="flex items-center gap-3 rounded-xl border bg-card p-3">
                <button type="button" onClick={() => onSelect(t.id)} className="flex min-w-0 flex-1 items-center gap-3 text-left outline-none focus-visible:underline">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-tag-violet-bg text-tag-violet-fg">
                    <TagIcon className="size-4" aria-hidden="true" />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{t.name}</span>
                    <span className="block text-caption text-muted-foreground">
                      {contactsLabel(t.contactCount)} · {usedInSummary(t)}
                    </span>
                  </span>
                </button>
                {rowMenu(t)}
              </li>
            ))}
          </ul>
        </>
      )}
      {error ? (
        <p className="text-caption text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      {dialogs}
    </div>
  );
}
