"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Pencil, Activity } from "lucide-react";
import { activityVisuals } from "@/components/contacts/activity-visuals";
import { subscribeToNotes } from "@/lib/firestore/contacts";
import { subscribeToActivities } from "@/lib/firestore/activities";
import { formatRelativeTime } from "@/lib/format";
import { useSubAccount } from "@/context/sub-account-context";
import type { Note, ActivityType } from "@/types/contacts";
import type { ActivityDoc } from "@/types/activities";

type TimelineItem =
  | { kind: "note"; id: string; createdAt: Note["createdAt"]; content: string }
  | {
      kind: "activity";
      id: string;
      type: ActivityType;
      createdAt: ActivityDoc["createdAt"];
      content: string;
      meta: ActivityDoc["meta"];
    };

export function ActivityTimeline({ contactId, limit }: { contactId: string; limit?: number }) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [activities, setActivities] = useState<ActivityDoc[]>([]);
  const [loadedNotes, setLoadedNotes] = useState(false);
  const [loadedActs, setLoadedActs] = useState(false);

  useEffect(() => {
    setLoadedNotes(false);
    setLoadedActs(false);
    const unsubNotes = subscribeToNotes(contactId, (list) => {
      setNotes(list);
      setLoadedNotes(true);
    });
    const unsubActs = subscribeToActivities(contactId, (list) => {
      setActivities(list);
      setLoadedActs(true);
    });
    return () => {
      unsubNotes();
      unsubActs();
    };
  }, [contactId]);

  const loading = !loadedNotes || !loadedActs;

  const items: TimelineItem[] = useMemo(() => {
    const merged: TimelineItem[] = [
      ...notes.map(
        (n) =>
          ({
            kind: "note" as const,
            id: n.id,
            createdAt: n.createdAt,
            content: n.content,
          }),
      ),
      ...activities.map(
        (a) =>
          ({
            kind: "activity" as const,
            id: a.id,
            type: a.type,
            createdAt: a.createdAt,
            content: a.content,
            meta: a.meta,
          }),
      ),
    ];
    merged.sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
    return merged;
  }, [notes, activities]);

  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-xl border bg-card p-4">
            <div className="mb-2 h-3 w-24 animate-pulse rounded bg-muted" />
            <div className="h-4 w-full animate-pulse rounded bg-muted" />
          </div>
        ))}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-dashed bg-card/50 p-8 text-center">
        <Activity className="mx-auto h-6 w-6 text-muted-foreground" />
        <p className="mt-2 text-sm font-medium">No activity yet</p>
        <p className="text-xs text-muted-foreground">
          Notes and updates will appear here.
        </p>
      </div>
    );
  }

  return (
    <ol className="relative space-y-4 pl-6 before:absolute before:top-2 before:bottom-2 before:left-3 before:w-px before:bg-border">
      {items.slice(0, limit ?? items.length).map((item) =>
        item.kind === "note" ? (
          <TimelineRow
            key={`n-${item.id}`}
            icon={<Pencil className="h-3 w-3 text-muted-foreground" />}
            label="Note added"
            when={item.createdAt}
          >
            <p className="whitespace-pre-wrap text-sm leading-relaxed">
              {item.content}
            </p>
          </TimelineRow>
        ) : (
          <ActivityRow key={`a-${item.id}`} item={item} />
        ),
      )}
    </ol>
  );
}

function ActivityRow({
  item,
}: {
  item: Extract<TimelineItem, { kind: "activity" }>;
}) {
  const { saPath } = useSubAccount();
  // Shared label map (Contacts redesign) — same labels as the Contact
  // profile's Activity tab; unknown types read "Activity", never "Note added".
  const visuals = activityVisuals(item.type, item.meta as Record<string, unknown> | null | undefined);
  const dealId = item.meta?.dealId;
  return (
    <TimelineRow icon={visuals.icon} label={visuals.label} when={item.createdAt}>
      <p className="text-sm leading-relaxed">{item.content}</p>
      {dealId && (
        <Link
          href={saPath("/pipeline")}
          className="mt-1 inline-block text-xs text-primary hover:underline"
        >
          View in pipeline →
        </Link>
      )}
    </TimelineRow>
  );
}

function TimelineRow({
  icon,
  label,
  when,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  when: Note["createdAt"];
  children: React.ReactNode;
}) {
  return (
    <li className="relative">
      <span className="absolute -left-[14px] top-3 flex h-6 w-6 items-center justify-center rounded-full border bg-background">
        {icon}
      </span>
      <div className="rounded-xl border bg-card p-4">
        <div className="mb-1 flex items-center justify-between gap-2">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {label}
          </span>
          <span className="text-xs text-muted-foreground">
            {formatRelativeTime(when)}
          </span>
        </div>
        {children}
      </div>
    </li>
  );
}

function toMillis(v: unknown): number {
  if (!v) return 0;
  if (v instanceof Date) return v.getTime();
  const maybe = v as { toDate?: () => Date; seconds?: number };
  if (typeof maybe.toDate === "function") return maybe.toDate().getTime();
  if (typeof maybe.seconds === "number") return maybe.seconds * 1000;
  return 0;
}
