"use client";

import Link from "next/link";
import { ArrowLeft, CalendarClock, ExternalLink, GitMerge, Pencil, Tag as TagIcon, Trash2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { contactsWithTagHref } from "@/lib/contacts/tag-names";
import type { TagSummary } from "@/types/contact-tags";
import { UsageSections, useTagDetail } from "./tag-dialogs";
import { contactsLabel, formatUpdated, USAGE_ICONS, usageLabel } from "./tags-client";

/**
 * One tag: name, counts, where it's used (with links to each item) and the
 * management actions. Desktop shows it beside the list; phones show it on
 * its own with "Back to tags".
 */
export function TagDetailPanel({
  subAccountId,
  tagId,
  nonce,
  canManage,
  onBack,
  onRename,
  onMerge,
  onDelete,
  className,
}: {
  subAccountId: string;
  tagId: string;
  nonce: number;
  canManage: boolean;
  onBack: () => void;
  onRename: (tag: TagSummary) => void;
  onMerge: (tag: TagSummary) => void;
  onDelete: (tag: TagSummary) => void;
  className?: string;
}) {
  const { detail, error, loadingMore, loadMore } = useTagDetail(subAccountId, tagId, nonce);
  const tag = detail?.tag ?? null;

  return (
    <section aria-label="Tag details" className={cn("flex min-w-0 flex-col gap-4", className)}>
      <Button variant="ghost" size="sm" className="self-start lg:hidden" onClick={onBack}>
        <ArrowLeft aria-hidden="true" /> Back to tags
      </Button>
      {error ? (
        <Alert tone="danger" title="Couldn't load this tag.">
          {error}
        </Alert>
      ) : !tag || !detail ? (
        <div className="flex flex-col gap-3 rounded-xl border bg-card p-5">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border bg-card p-4 sm:p-5">
            <div className="flex min-w-0 items-center gap-3">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-tag-violet-bg text-tag-violet-fg">
                <TagIcon className="size-5" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <h2 className="truncate text-title-md font-semibold">{tag.name}</h2>
                <p className="text-caption text-muted-foreground">Tag · {contactsLabel(tag.contactCount)}</p>
              </div>
            </div>
            {canManage ? (
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" size="sm" onClick={() => onRename(tag)}>
                  <Pencil aria-hidden="true" /> Rename
                </Button>
                <Button variant="secondary" size="sm" onClick={() => onMerge(tag)}>
                  <GitMerge aria-hidden="true" /> Merge
                </Button>
                <Button variant="destructive" size="sm" onClick={() => onDelete(tag)}>
                  <Trash2 aria-hidden="true" /> Delete
                </Button>
              </div>
            ) : null}
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex items-center gap-3 rounded-xl border bg-card p-4">
              <Users className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
              <div>
                <p className="text-caption text-muted-foreground">Contacts</p>
                <p className="text-lg font-semibold tabular-nums">{tag.contactCount.toLocaleString()}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 rounded-xl border bg-card p-4">
              <CalendarClock className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
              <div>
                <p className="text-caption text-muted-foreground">Last updated</p>
                <p className="text-sm font-medium">{tag.registered ? formatUpdated(tag.updatedAt) : "Not yet in the tag library"}</p>
              </div>
            </div>
          </div>

          {tag.variants.length > 0 ? (
            <Alert tone="info" title="Also written another way">
              {tag.variants.map((v) => `“${v.name}” (${contactsLabel(v.contactCount)})`).join(", ")}. These count as the same tag.
              {canManage ? " Use Merge to switch them all to one spelling." : ""}
            </Alert>
          ) : null}

          <div className="flex flex-col gap-3 rounded-xl border bg-card p-4 sm:p-5">
            <div>
              <h3 className="text-sm font-semibold">Usage summary</h3>
              <p className="text-caption text-muted-foreground">Settings that add, test or change this tag. Contacts are counted separately.</p>
            </div>
            {tag.usageCount > 0 ? (
              <ul className="flex flex-wrap gap-2">
                {detail.sections
                  .filter((s) => s.total > 0)
                  .map((s) => {
                    const Icon = USAGE_ICONS[s.type];
                    return (
                      <li key={s.type} className="inline-flex items-center gap-1.5 rounded-chip border bg-background px-3 py-1.5 text-body-sm">
                        <Icon className="size-3.5 text-muted-foreground" aria-hidden="true" />
                        {usageLabel(s.type, s.total)}
                      </li>
                    );
                  })}
              </ul>
            ) : null}
            <UsageSections detail={detail} loadingMore={loadingMore} loadMore={loadMore} external={false} defaultOpen="all" />
          </div>

          <Link
            href={contactsWithTagHref(subAccountId, tag.name)}
            className="flex items-center justify-between gap-3 rounded-xl border bg-card px-4 py-3 text-sm font-medium text-link outline-none hover:bg-muted/40 focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <span className="inline-flex items-center gap-2">
              <Users className="size-4" aria-hidden="true" /> View all contacts ({tag.contactCount.toLocaleString()})
            </span>
            <ExternalLink className="size-4" aria-hidden="true" />
          </Link>
        </>
      )}
    </section>
  );
}
