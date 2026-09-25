"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Activity, AlertCircle, ChevronDown, Loader2, RotateCw } from "lucide-react";
import { useSubAccount } from "@/context/sub-account-context";
import { useContactFeedHead } from "@/hooks/use-contact-feed-head";
import { formatRelativeTime } from "@/lib/format";
import { ACTIVITY_FILTERS, type ActivityCategory } from "@/lib/contacts/activity-categories";
import { activityVisuals } from "@/components/contacts/activity-visuals";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ContactActivityItem, ContactActivityPage } from "@/types/contact-feed";

type Filter = "all" | ActivityCategory;

/**
 * Contact profile → Activity tab (Contacts redesign, 2026-09-25).
 *
 * A chronological record of what happened with this contact, read one page
 * at a time from `GET /api/contacts/[id]/activity` (the old timeline held
 * listeners on the ENTIRE notes + activities history). Notes are their own
 * tab now; here a note appears only as a content-free "Note added" row that
 * opens the Notes tab.
 */
export function ContactActivityFeed({
  contactId,
  onOpenNote,
}: {
  contactId: string;
  /** Switch to the Notes tab (optionally focusing a note). */
  onOpenNote?: (noteId: string) => void;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const [items, setItems] = useState<ContactActivityItem[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);
  const headVersion = useContactFeedHead(contactId, ["activities", "notes"]);

  const loadFirst = useCallback(
    async (quiet = false) => {
      const id = ++requestId.current;
      if (!quiet) setLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/contacts/${contactId}/activity?filter=${filter}`,
          { cache: "no-store" },
        );
        const data = (await res.json().catch(() => ({}))) as ContactActivityPage & {
          error?: string;
        };
        if (!res.ok) throw new Error(data.error ?? "Couldn't load activity.");
        if (id !== requestId.current) return;
        setItems(data.items ?? []);
        setCursor(data.nextCursor ?? null);
      } catch (err) {
        if (id === requestId.current) {
          setError(err instanceof Error ? err.message : "Couldn't load activity.");
        }
      } finally {
        if (id === requestId.current) setLoading(false);
      }
    },
    [contactId, filter],
  );

  useEffect(() => {
    void loadFirst();
  }, [loadFirst]);

  // New activity or a new note elsewhere (a send, a webhook, a teammate) →
  // quietly refresh the first page.
  useEffect(() => {
    if (headVersion > 0) void loadFirst(true);
  }, [headVersion, loadFirst]);

  async function loadMore() {
    if (!cursor) return;
    setLoadingMore(true);
    try {
      const res = await fetch(
        `/api/contacts/${contactId}/activity?filter=${filter}&cursor=${encodeURIComponent(cursor)}`,
        { cache: "no-store" },
      );
      const data = (await res.json().catch(() => ({}))) as ContactActivityPage & {
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "Couldn't load more activity.");
      setItems((prev) => {
        const seen = new Set(prev.map((i) => i.id));
        return [...prev, ...(data.items ?? []).filter((i) => !seen.has(i.id))];
      });
      setCursor(data.nextCursor ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't load more activity.");
    } finally {
      setLoadingMore(false);
    }
  }

  const filterLabel = ACTIVITY_FILTERS.find((f) => f.value === filter)?.label ?? "All activity";

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold">Recent activity</p>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-xs" />
            }
          >
            {filterLabel}
            <ChevronDown className="h-3 w-3" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuRadioGroup
              value={filter}
              onValueChange={(v) => setFilter(v as Filter)}
            >
              {ACTIVITY_FILTERS.map((f) => (
                <DropdownMenuRadioItem key={f.value} value={f.value} className="text-xs">
                  {f.label}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {loading ? (
        <div className="space-y-2" aria-busy="true" aria-label="Loading activity">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-14 animate-pulse rounded-lg border bg-muted/40" />
          ))}
        </div>
      ) : error && items.length === 0 ? (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-xs">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />
          <p className="min-w-0 flex-1 text-muted-foreground">{error}</p>
          <Button size="sm" variant="outline" className="h-7" onClick={() => void loadFirst()}>
            <RotateCw className="mr-1 h-3 w-3" /> Retry
          </Button>
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-card/50 p-8 text-center">
          <Activity className="mx-auto h-6 w-6 text-muted-foreground" />
          <p className="mt-2 text-sm font-medium">
            {filter === "all" ? "No activity yet" : "Nothing here yet"}
          </p>
          <p className="text-xs text-muted-foreground">
            Messages, meetings, purchases and other updates will appear here.
          </p>
        </div>
      ) : (
        <ol className="divide-y rounded-xl border bg-card">
          {items.map((item) => (
            <ActivityRow key={item.id} item={item} onOpenNote={onOpenNote} />
          ))}
        </ol>
      )}

      {cursor && !loading && (
        <div className="flex justify-center">
          <Button variant="outline" size="sm" onClick={loadMore} disabled={loadingMore}>
            {loadingMore && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
            Load older activity
          </Button>
        </div>
      )}
      {error && items.length > 0 && (
        <p className="text-center text-xs text-destructive">{error}</p>
      )}
    </div>
  );
}

function ActivityRow({
  item,
  onOpenNote,
}: {
  item: ContactActivityItem;
  onOpenNote?: (noteId: string) => void;
}) {
  const { saPath } = useSubAccount();
  const visuals = activityVisuals(item.type, item.meta);
  const when = new Date(item.createdAt);
  const noteId = typeof item.meta?.noteId === "string" ? item.meta.noteId : null;
  const dealId = typeof item.meta?.dealId === "string" ? item.meta.dealId : null;
  const quoteId = typeof item.meta?.quoteId === "string" ? item.meta.quoteId : null;

  return (
    <li className="flex gap-3 px-3 py-3 sm:px-4">
      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border bg-background">
        {visuals.icon}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
          <p className="text-sm font-medium">
            {visuals.label}
            {item.actorName && (
              <span className="font-normal text-muted-foreground"> · {item.actorName}</span>
            )}
          </p>
          <time
            dateTime={item.createdAt}
            title={when.toLocaleString()}
            className="shrink-0 text-xs text-muted-foreground"
          >
            {formatRelativeTime(when)}
          </time>
        </div>
        {item.kind === "note" ? (
          noteId && onOpenNote ? (
            <button
              type="button"
              onClick={() => onOpenNote(noteId)}
              className="mt-0.5 text-xs font-medium text-primary hover:underline"
            >
              View in Notes →
            </button>
          ) : null
        ) : (
          item.content && (
            <p className="mt-0.5 whitespace-pre-wrap break-words text-xs text-muted-foreground">
              {item.content}
            </p>
          )
        )}
        {dealId && (
          <Link href={saPath("/pipeline")} className="mt-1 inline-block text-xs text-primary hover:underline">
            View in pipeline →
          </Link>
        )}
        {quoteId && (
          <Link
            href={saPath(`/quotes/${quoteId}`)}
            className="mt-1 inline-block text-xs text-primary hover:underline"
          >
            View quote →
          </Link>
        )}
      </div>
    </li>
  );
}
