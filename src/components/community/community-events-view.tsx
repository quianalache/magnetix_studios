"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { CalendarPlus } from "lucide-react";
import { TimezoneSelect } from "@/components/ui/timezone-select";

export interface CommunityEventViewModel {
  id: string;
  title: string;
  description: string;
  startAt: number | null;
  endAt: number | null;
  timezone: string;
  status: "scheduled" | "live" | "ended" | "canceled";
  channel: string | null;
  locationType: "magnetix_live" | "external" | "none";
  externalUrl: string | null;
  liveSessionId: string | null;
  liveMode: "meeting" | "broadcast" | null;
}

function dateLabel(ms: number | null, timezone: string) {
  if (!ms) return "Date not set";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: timezone,
  }).format(new Date(ms));
}

function localInputValue(date: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function CommunityEventsView({
  saId,
  groupId,
  groupSlug,
  pretty = false,
  categories,
  initialEvents,
  moderator,
}: {
  saId: string;
  groupId: string;
  groupSlug: string;
  pretty?: boolean;
  categories: string[];
  initialEvents: CommunityEventViewModel[];
  moderator: boolean;
}) {
  const [events, setEvents] = useState(initialEvents);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState(() => ({
    title: "",
    description: "",
    startAt: localInputValue(new Date(Date.now() + 86400000)),
    endAt: localInputValue(new Date(Date.now() + 90000000)),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    channel: "",
    locationType: "magnetix_live",
    liveMode: "meeting",
    externalUrl: "",
  }));
  const upcoming = useMemo(
    () => events.filter((e) => e.status === "scheduled" || e.status === "live"),
    [events]
  );
  const past = useMemo(
    () => events.filter((e) => e.status === "ended" || e.status === "canceled"),
    [events]
  );
  const liveHref = (eventId: string) =>
    pretty
      ? `/communities/${groupSlug}/events/${eventId}/live`
      : `/c/${saId}/${groupSlug}/events/${eventId}/live`;
  async function create() {
    setSaving(true);
    setError("");
    const response = await fetch(`/api/community/${saId}/${groupId}/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...draft,
        channel: draft.channel || null,
        externalUrl: draft.externalUrl || null,
      }),
    });
    const data = (await response.json()) as {
      event?: CommunityEventViewModel;
      error?: string;
    };
    setSaving(false);
    if (!response.ok || !data.event) {
      setError(data.error ?? "Unable to create event.");
      return;
    }
    setEvents((current) => [...current, data.event!]);
    setOpen(false);
  }
  async function changeStatus(
    eventId: string,
    status: "live" | "ended" | "canceled"
  ) {
    const response = await fetch(`/api/community/${saId}/${groupId}/events`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventId, status }),
    });
    const data = (await response.json()) as {
      event?: CommunityEventViewModel;
      error?: string;
    };
    if (!response.ok || !data.event) {
      setError(data.error ?? "Unable to update event.");
      return;
    }
    setEvents((current) =>
      current.map((event) => (event.id === eventId ? data.event! : event))
    );
  }
  function card(event: CommunityEventViewModel) {
    return (
      <article
        key={event.id}
        className="rounded-xl border border-[#E4E4E4] bg-white p-4"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="font-semibold">{event.title}</h3>
            <p className="text-muted-foreground mt-1 text-sm">
              {dateLabel(event.startAt, event.timezone)} · {event.timezone}
            </p>
          </div>
          <span className="rounded-full border px-2 py-1 text-xs capitalize">
            {event.status}
          </span>
        </div>
        {event.description && (
          <p className="mt-3 text-sm text-[#5f5f66]">{event.description}</p>
        )}
        <p className="mt-3 text-xs text-[#777]">
          {event.locationType === "magnetix_live"
            ? `Magnetix Live · ${event.liveMode === "broadcast" ? "Broadcast" : "Meeting Room"}`
            : event.locationType === "external"
              ? "External link"
              : "No online location"}
          {event.channel ? ` · ${event.channel}` : ""}
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          {event.status === "live" &&
            event.locationType === "magnetix_live" && (
              <Link
                className="bg-primary text-primary-foreground rounded-md px-3 py-2 text-sm"
                href={liveHref(event.id)}
              >
                Join Live
              </Link>
            )}
          {event.status === "scheduled" &&
            moderator &&
            event.locationType === "magnetix_live" && (
              <button
                className="rounded-md border px-3 py-2 text-sm"
                onClick={() => void changeStatus(event.id, "live")}
              >
                Start event
              </button>
            )}
          {event.status === "scheduled" && moderator && (
            <button
              className="rounded-md border px-3 py-2 text-sm"
              onClick={() => void changeStatus(event.id, "canceled")}
            >
              Cancel
            </button>
          )}
          {event.status === "live" && moderator && (
            <button
              className="rounded-md border px-3 py-2 text-sm"
              onClick={() => void changeStatus(event.id, "ended")}
            >
              End event
            </button>
          )}
          {event.locationType === "external" && event.externalUrl && (
            <a
              className="rounded-md border px-3 py-2 text-sm"
              href={event.externalUrl}
              target="_blank"
              rel="noreferrer"
            >
              Open link
            </a>
          )}
        </div>
      </article>
    );
  }
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Events</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Schedule and join Community events.
          </p>
        </div>
        {moderator && (
          <button
            className="bg-primary text-primary-foreground inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm"
            onClick={() => setOpen(true)}
          >
            <CalendarPlus className="h-4 w-4" /> Create Event
          </button>
        )}
      </div>
      {error && (
        <p className="rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-800">
          {error}
        </p>
      )}
      <section>
        <h2 className="mb-3 font-semibold">Upcoming</h2>
        {upcoming.length ? (
          <div className="space-y-3">{upcoming.map(card)}</div>
        ) : (
          <p className="rounded-xl border border-dashed p-8 text-sm text-[#777]">
            No upcoming events.
          </p>
        )}
      </section>
      <section>
        <h2 className="mb-3 font-semibold">Past</h2>
        {past.length ? (
          <div className="space-y-3">{past.map(card)}</div>
        ) : (
          <p className="rounded-xl border border-dashed p-8 text-sm text-[#777]">
            No past events.
          </p>
        )}
      </section>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-xl bg-white p-5 shadow-xl">
            <h2 className="text-lg font-semibold">Create Event</h2>
            <div className="mt-4 space-y-3">
              <input
                className="w-full rounded-md border px-3 py-2"
                placeholder="Title"
                value={draft.title}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              />
              <textarea
                className="w-full rounded-md border px-3 py-2"
                placeholder="Description"
                value={draft.description}
                onChange={(e) =>
                  setDraft({ ...draft, description: e.target.value })
                }
              />
              <label className="block text-sm">
                Start
                <input
                  className="mt-1 w-full rounded-md border px-3 py-2"
                  type="datetime-local"
                  value={draft.startAt}
                  onChange={(e) =>
                    setDraft({ ...draft, startAt: e.target.value })
                  }
                />
              </label>
              <label className="block text-sm">
                End
                <input
                  className="mt-1 w-full rounded-md border px-3 py-2"
                  type="datetime-local"
                  value={draft.endAt}
                  onChange={(e) =>
                    setDraft({ ...draft, endAt: e.target.value })
                  }
                />
              </label>
              <label className="block text-sm">
                Timezone
                <TimezoneSelect
                  value={draft.timezone}
                  onChange={(timezone) => setDraft({ ...draft, timezone })}
                />
              </label>
              <label className="block text-sm">
                Channel
                <select
                  className="mt-1 w-full rounded-md border px-3 py-2"
                  value={draft.channel}
                  onChange={(e) =>
                    setDraft({ ...draft, channel: e.target.value })
                  }
                >
                  <option value="">Entire Community</option>
                  {categories.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-sm">
                Location
                <select
                  className="mt-1 w-full rounded-md border px-3 py-2"
                  value={draft.locationType}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      locationType: e.target.value as typeof draft.locationType,
                    })
                  }
                >
                  <option value="magnetix_live">Magnetix Live Room</option>
                  <option value="external">External Link</option>
                  <option value="none">No Online Location</option>
                </select>
              </label>
              {draft.locationType === "magnetix_live" && (
                <label className="block text-sm">
                  Mode
                  <select
                    className="mt-1 w-full rounded-md border px-3 py-2"
                    value={draft.liveMode}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        liveMode: e.target.value as typeof draft.liveMode,
                      })
                    }
                  >
                    <option value="meeting">Meeting Room</option>
                    <option value="broadcast">Broadcast</option>
                  </select>
                </label>
              )}
              {draft.locationType === "external" && (
                <input
                  className="w-full rounded-md border px-3 py-2"
                  placeholder="https://..."
                  value={draft.externalUrl}
                  onChange={(e) =>
                    setDraft({ ...draft, externalUrl: e.target.value })
                  }
                />
              )}
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                className="rounded-md border px-3 py-2 text-sm"
                onClick={() => setOpen(false)}
              >
                Cancel
              </button>
              <button
                disabled={saving}
                className="bg-primary text-primary-foreground rounded-md px-3 py-2 text-sm disabled:opacity-50"
                onClick={() => void create()}
              >
                {saving ? "Saving…" : "Save event"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
