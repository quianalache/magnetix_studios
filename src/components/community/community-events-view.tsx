"use client";

import {
  useMemo,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import Link from "next/link";
import {
  ChevronLeft,
  ChevronRight,
  ImagePlus,
  MonitorPlay,
  Plus,
  Radio,
  X,
} from "lucide-react";
import { TimezoneSelect } from "@/components/ui/timezone-select";
import { validateCommunityEventSchedule } from "@/lib/community/event-scheduling";

export interface CommunityEventViewModel {
  id: string;
  title: string;
  description: string;
  startAt: number | null;
  endAt: number | null;
  timezone: string;
  status: "scheduled" | "live" | "ended" | "canceled";
  channel: string | null;
  accentColor?: string | null;
  thumbnailUrl?: string | null;
  hideAttendees?: boolean;
  reminderEnabled?: boolean;
  locationType: "magnetix_live" | "external" | "none";
  externalUrl: string | null;
  liveSessionId: string | null;
  liveMode: "meeting" | "broadcast" | null;
}
type CalendarView = "month" | "week" | "day";
type ModalStep = "details" | "access" | "payment";
type EventDraft = {
  title: string;
  description: string;
  accentColor: string;
  startAt: string;
  endAt: string;
  timezone: string;
  channel: string;
  locationType: CommunityEventViewModel["locationType"];
  liveMode: "meeting" | "broadcast";
  externalUrl: string;
  thumbnailUrl: string;
  hideAttendees: boolean;
  reminderEnabled: boolean;
};
const dayStart = (d: Date) =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d: Date, n: number) =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();
const pad = (n: number) => String(n).padStart(2, "0");
const toMs = (e: CommunityEventViewModel) => e.startAt ?? 0;
function localInputValue(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function formatTime(ms: number | null, tz: string) {
  return ms
    ? new Intl.DateTimeFormat(undefined, {
        hour: "numeric",
        minute: "2-digit",
        timeZone: tz,
      }).format(new Date(ms))
    : "Time TBD";
}
function formatDate(ms: number | null, tz: string) {
  return ms
    ? new Intl.DateTimeFormat(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
        year: "numeric",
        timeZone: tz,
      }).format(new Date(ms))
    : "Date TBD";
}
function timezoneLabel(tz: string) {
  const offset = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    timeZoneName: "longOffset",
  })
    .formatToParts(new Date())
    .find((p) => p.type === "timeZoneName")?.value;
  return `${tz}${offset ? ` (${offset})` : ""}`;
}
function dateInTimezone(value: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(value);
  const get = (type: "year" | "month" | "day") =>
    Number(parts.find((part) => part.type === type)?.value);
  return new Date(get("year"), get("month") - 1, get("day"));
}

export function CommunityEventsView({
  saId,
  groupId,
  groupSlug,
  pretty = false,
  staffGroupId,
  categories,
  initialEvents,
  moderator,
}: {
  saId: string;
  groupId: string;
  groupSlug: string;
  pretty?: boolean;
  staffGroupId?: string;
  categories: string[];
  initialEvents: CommunityEventViewModel[];
  moderator: boolean;
}) {
  const [events, setEvents] = useState(initialEvents);
  const [view, setView] = useState<CalendarView>("month");
  const [cursor, setCursor] = useState(dayStart(new Date()));
  const [railMode, setRailMode] = useState<"upcoming" | "past">("upcoming");
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<ModalStep>("details");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [draft, setDraft] = useState(() => ({
    title: "",
    description: "",
    accentColor: "",
    startAt: localInputValue(new Date(Date.now() + 86400000)),
    endAt: localInputValue(new Date(Date.now() + 90000000)),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
    channel: "",
    locationType: "magnetix_live" as CommunityEventViewModel["locationType"],
    liveMode: "meeting" as "meeting" | "broadcast",
    externalUrl: "",
    thumbnailUrl: "",
    hideAttendees: false,
    reminderEnabled: false,
  }));
  const routeBase = staffGroupId
    ? `/sa/${saId}/community/${staffGroupId}/events`
    : pretty
      ? `/communities/${groupSlug}/events`
      : `/c/${saId}/${groupSlug}/events`;
  const detailHref = (id: string) => `${routeBase}/${id}`;
  const recordingsHref = `${routeBase}/recordings`;
  const now = Date.now();
  const calendarToday = useMemo(
    () => dateInTimezone(new Date(), draft.timezone),
    [draft.timezone]
  );
  const upcoming = useMemo(
    () =>
      events
        .filter(
          (e) =>
            e.status !== "canceled" && (e.status === "live" || toMs(e) >= now)
        )
        .sort((a, b) => toMs(a) - toMs(b)),
    [events, now]
  );
  const past = useMemo(
    () =>
      events
        .filter(
          (e) =>
            e.status === "canceled" ||
            ((e.status === "ended" || toMs(e) < now) && e.status !== "live")
        )
        .sort((a, b) => toMs(b) - toMs(a)),
    [events, now]
  );
  const calendarDays = useMemo(() => {
    if (view === "day") return [cursor];
    if (view === "week") {
      const start = addDays(cursor, -((cursor.getDay() + 6) % 7));
      return Array.from({ length: 7 }, (_, i) => addDays(start, i));
    }
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const start = addDays(first, -first.getDay());
    return Array.from({ length: 42 }, (_, i) => addDays(start, i));
  }, [cursor, view]);
  const heading = new Intl.DateTimeFormat(
    undefined,
    view === "day"
      ? { weekday: "long", month: "long", day: "numeric", year: "numeric" }
      : { month: "long", year: "numeric" }
  ).format(cursor);
  const move = (n: number) =>
    view === "month"
      ? setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + n, 1))
      : setCursor(addDays(cursor, n * (view === "week" ? 7 : 1)));
  async function uploadThumbnail(file: File) {
    setUploading(true);
    setError("");
    const form = new FormData();
    form.append("file", file);
    form.append("kind", "event");
    const response = await fetch(
      `/api/community/${saId}/${groupId}/settings/upload`,
      { method: "POST", body: form }
    );
    const data = (await response.json().catch(() => ({}))) as {
      url?: string;
      error?: string;
    };
    setUploading(false);
    if (!response.ok || !data.url)
      return setError(data.error ?? "Unable to upload thumbnail.");
    setDraft((d) => ({ ...d, thumbnailUrl: data.url! }));
  }
  async function create() {
    const schedule = validateCommunityEventSchedule(draft);
    if (!draft.title.trim()) return setError("Title is required.");
    if (!draft.description.trim()) return setError("Description is required.");
    if (!schedule.ok) return setError(schedule.error);
    if (draft.locationType === "external" && !draft.externalUrl.trim())
      return setError("An external event needs a meeting URL.");
    setSaving(true);
    setError("");
    const response = await fetch(`/api/community/${saId}/${groupId}/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...draft,
        channel: draft.channel || null,
        externalUrl: draft.externalUrl || null,
        thumbnailUrl: draft.thumbnailUrl || null,
      }),
    });
    const data = (await response.json()) as {
      event?: CommunityEventViewModel;
      error?: string;
    };
    setSaving(false);
    if (!response.ok || !data.event)
      return setError(data.error ?? "Unable to create event.");
    setEvents((current) => [...current, data.event!]);
    setOpen(false);
  }
  const railEvents = railMode === "upcoming" ? upcoming : past;
  return (
    <div className="space-y-5" style={{ color: "var(--community-text)" }}>
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p
            className="text-sm font-medium"
            style={{ color: "var(--community-primary)" }}
          >
            Community calendar
          </p>
          <h1 className="text-2xl font-semibold">Events</h1>
          <p
            className="mt-1 text-sm"
            style={{ color: "var(--community-text-muted)" }}
          >
            Plan, share, and attend Community sessions.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href={recordingsHref}
            className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium"
            style={{
              borderColor: "var(--community-border)",
              backgroundColor: "var(--community-surface)",
            }}
          >
            <MonitorPlay className="h-4 w-4" /> Recordings
          </Link>
          {moderator && (
            <button
              onClick={() => {
                setOpen(true);
                setStep("details");
                setError("");
              }}
              className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-white"
              style={{ backgroundColor: "var(--community-primary-action)" }}
            >
              <Plus className="h-4 w-4" /> Create Event
            </button>
          )}
        </div>
      </header>
      {error && (
        <p
          className="rounded-lg border px-3 py-2 text-sm"
          style={{
            borderColor: "#ef4444",
            color: "#b91c1c",
            backgroundColor: "#fef2f2",
          }}
        >
          {error}
        </p>
      )}
      <div className="grid gap-5 xl:grid-cols-[240px_minmax(0,1fr)]">
        <aside
          className="space-y-4 rounded-xl border p-4"
          style={{
            borderColor: "var(--community-border)",
            backgroundColor: "var(--community-surface)",
          }}
        >
          <div
            className="grid grid-cols-2 rounded-lg p-1"
            style={{ backgroundColor: "var(--community-bg)" }}
          >
            {(["upcoming", "past"] as const).map((m) => (
              <button
                key={m}
                onClick={() => setRailMode(m)}
                className="rounded-md px-2 py-1.5 text-xs font-medium capitalize"
                style={
                  railMode === m
                    ? {
                        backgroundColor: "var(--community-surface)",
                        color: "var(--community-primary)",
                        boxShadow: "0 1px 2px #0002",
                      }
                    : { color: "var(--community-text-muted)" }
                }
              >
                {m}
              </button>
            ))}
          </div>
          <div className="space-y-2">
            <p
              className="text-[11px] font-semibold tracking-wide uppercase"
              style={{ color: "var(--community-text-muted)" }}
            >
              {railMode} events
            </p>
            {railEvents.slice(0, 5).map((e) => (
              <Link
                href={detailHref(e.id)}
                key={e.id}
                className="block border-l-2 pl-2.5 text-sm"
                style={{
                  borderColor: e.accentColor || "var(--community-primary)",
                }}
              >
                <p className="leading-tight font-medium">{e.title}</p>
                <p
                  className="mt-0.5 text-xs"
                  style={{ color: "var(--community-text-muted)" }}
                >
                  {formatDate(e.startAt, e.timezone)} ·{" "}
                  {formatTime(e.startAt, e.timezone)}
                </p>
              </Link>
            ))}
            {!railEvents.length && (
              <p
                className="text-sm"
                style={{ color: "var(--community-text-muted)" }}
              >
                No {railMode} events.
              </p>
            )}
          </div>
        </aside>
        <section
          className="overflow-hidden rounded-xl border"
          style={{
            borderColor: "var(--community-border)",
            backgroundColor: "var(--community-surface)",
          }}
        >
          <div
            className="flex flex-wrap items-center justify-between gap-3 border-b p-4"
            style={{ borderColor: "var(--community-border)" }}
          >
            <div className="flex items-center gap-2">
              <button onClick={() => move(-1)} aria-label="Previous">
                <ChevronLeft className="h-4 w-4" />
              </button>
              <h2 className="font-semibold">{heading}</h2>
              <button onClick={() => move(1)} aria-label="Next">
                <ChevronRight className="h-4 w-4" />
              </button>
              <button
                onClick={() => setCursor(calendarToday)}
                className="rounded-md border px-2 py-1 text-xs"
                style={{ borderColor: "var(--community-border)" }}
              >
                Today
              </button>
            </div>
            <div
              className="flex rounded-lg border p-1"
              style={{ borderColor: "var(--community-border)" }}
            >
              {(["month", "week", "day"] as CalendarView[]).map((k) => (
                <button
                  key={k}
                  onClick={() => setView(k)}
                  className="rounded-md px-2.5 py-1 text-xs font-medium capitalize"
                  style={
                    view === k
                      ? {
                          backgroundColor: "var(--community-primary)",
                          color: "white",
                        }
                      : { color: "var(--community-text-muted)" }
                  }
                >
                  {k}
                </button>
              ))}
            </div>
          </div>
          <p
            className="px-4 pt-3 text-xs"
            style={{ color: "var(--community-text-muted)" }}
          >
            Timezone: {timezoneLabel(draft.timezone)}
          </p>
          <div
            className={
              view === "month"
                ? "mt-3 grid grid-cols-7 border-t"
                : "mt-3 grid border-t"
            }
            style={{
              borderColor: "var(--community-border)",
              gridTemplateColumns:
                view === "month"
                  ? undefined
                  : `repeat(${calendarDays.length}, minmax(0, 1fr))`,
            }}
          >
            {view === "month" &&
              ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
                <div
                  key={d}
                  className="border-b px-2 py-2 text-center text-[11px] font-semibold"
                  style={{
                    borderColor: "var(--community-border)",
                    color: "var(--community-text-muted)",
                  }}
                >
                  {d}
                </div>
              ))}
            {calendarDays.map((d) => {
              const same = events.filter(
                (e) => e.startAt && sameDay(new Date(e.startAt), d)
              );
              const today = sameDay(d, calendarToday);
              return (
                <div
                  key={d.toISOString()}
                  className={
                    view === "month"
                      ? "min-h-28 border-r border-b p-2 sm:min-h-32"
                      : "min-h-72 border-r p-2"
                  }
                  style={{ borderColor: "var(--community-border)" }}
                >
                  <button
                    onClick={() => {
                      setCursor(d);
                      setView("day");
                    }}
                    className="mb-2 text-xs font-medium"
                    aria-current={today ? "date" : undefined}
                    style={
                      d.getMonth() === cursor.getMonth() || view !== "month"
                        ? { color: "var(--community-text)" }
                        : { color: "var(--community-text-muted)" }
                    }
                  >
                    <span
                      className={
                        view === "month" && today
                          ? "inline-flex min-h-6 min-w-6 items-center justify-center rounded-full px-1"
                          : today
                            ? "font-semibold"
                            : undefined
                      }
                      style={
                        today
                          ? {
                              backgroundColor:
                                view === "month"
                                  ? "var(--community-primary)"
                                  : undefined,
                              color:
                                view === "month"
                                  ? "white"
                                  : "var(--community-primary)",
                            }
                          : undefined
                      }
                    >
                      {view === "month"
                        ? d.getDate()
                        : new Intl.DateTimeFormat(undefined, {
                            weekday: "short",
                            day: "numeric",
                          }).format(d)}
                    </span>
                  </button>
                  <div className="space-y-1">
                    {same.map((e) => (
                      <Link
                        href={detailHref(e.id)}
                        key={e.id}
                        className="block truncate rounded px-1.5 py-1 text-[11px] font-medium"
                        style={{
                          backgroundColor: `${e.accentColor || "var(--community-primary)"}22`,
                          borderLeft: `3px solid ${e.accentColor || "var(--community-primary)"}`,
                          color: "var(--community-text)",
                        }}
                      >
                        {formatTime(e.startAt, e.timezone)} {e.title}
                      </Link>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>
      {open && (
        <CreateDialog
          step={step}
          setStep={setStep}
          close={() => setOpen(false)}
          draft={draft}
          setDraft={setDraft}
          categories={categories}
          uploading={uploading}
          uploadThumbnail={uploadThumbnail}
          saving={saving}
          create={create}
        />
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block text-sm font-medium">
      <span className="mb-1.5 block">{label}</span>
      {children}
    </label>
  );
}
function CreateDialog({
  step,
  setStep,
  close,
  draft,
  setDraft,
  categories,
  uploading,
  uploadThumbnail,
  saving,
  create,
}: {
  step: ModalStep;
  setStep: (s: ModalStep) => void;
  close: () => void;
  draft: EventDraft;
  setDraft: Dispatch<SetStateAction<EventDraft>>;
  categories: string[];
  uploading: boolean;
  uploadThumbnail: (f: File) => Promise<void>;
  saving: boolean;
  create: () => Promise<void>;
}) {
  const input = "w-full rounded-md border px-3 py-2";
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4">
      <div
        className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-xl border shadow-2xl"
        style={{
          backgroundColor: "var(--community-surface)",
          borderColor: "var(--community-border)",
          color: "var(--community-text)",
        }}
      >
        <div
          className="flex items-center justify-between border-b px-5 py-4"
          style={{ borderColor: "var(--community-border)" }}
        >
          <div>
            <h2 className="font-semibold">Create Event</h2>
            <p
              className="text-xs"
              style={{ color: "var(--community-text-muted)" }}
            >
              Schedule a Community session.
            </p>
          </div>
          <button onClick={close} aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div
          className="flex border-b px-5"
          style={{ borderColor: "var(--community-border)" }}
        >
          {(
            [
              ["details", "Event"],
              ["access", "Location & Access"],
              ["payment", "Payment Details"],
            ] as const
          ).map(([v, l]) => (
            <button
              key={v}
              onClick={() => setStep(v)}
              className="border-b-2 px-3 py-3 text-xs font-medium"
              style={
                step === v
                  ? {
                      color: "var(--community-primary)",
                      borderColor: "var(--community-primary)",
                    }
                  : {
                      color: "var(--community-text-muted)",
                      borderColor: "transparent",
                    }
              }
            >
              {l}
            </button>
          ))}
        </div>
        <div className="space-y-4 p-5">
          {step === "details" && (
            <>
              <Field label="Title">
                <input
                  value={draft.title}
                  maxLength={200}
                  onChange={(e) =>
                    setDraft({ ...draft, title: e.target.value })
                  }
                  className={input}
                  placeholder="Name of the event"
                />
              </Field>
              <Field label="Description">
                <textarea
                  value={draft.description}
                  maxLength={300}
                  onChange={(e) =>
                    setDraft({ ...draft, description: e.target.value })
                  }
                  className={`${input} min-h-24`}
                  placeholder="What should members know?"
                />
                <p
                  className="text-right text-xs"
                  style={{ color: "var(--community-text-muted)" }}
                >
                  {draft.description.length}/300
                </p>
              </Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Start">
                  <input
                    type="datetime-local"
                    value={draft.startAt}
                    onChange={(e) =>
                      setDraft({ ...draft, startAt: e.target.value })
                    }
                    className={input}
                  />
                </Field>
                <Field label="End">
                  <input
                    type="datetime-local"
                    value={draft.endAt}
                    onChange={(e) =>
                      setDraft({ ...draft, endAt: e.target.value })
                    }
                    className={input}
                  />
                </Field>
              </div>
              <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
                <Field label="Timezone">
                  <TimezoneSelect
                    value={draft.timezone}
                    onChange={(timezone) => setDraft({ ...draft, timezone })}
                  />
                </Field>
                <Field label="Event color">
                  <input
                    type="color"
                    value={draft.accentColor || "#64748b"}
                    onChange={(e) =>
                      setDraft({ ...draft, accentColor: e.target.value })
                    }
                    className="h-10 w-12 cursor-pointer rounded border p-1"
                  />
                </Field>
              </div>
            </>
          )}
          {step === "access" && (
            <>
              <Field label="Location">
                <select
                  value={draft.locationType}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      locationType: e.target
                        .value as EventDraft["locationType"],
                    })
                  }
                  className={input}
                >
                  <option value="magnetix_live">Magnetix Live Room</option>
                  <option value="external">External link</option>
                  <option value="none">No online location</option>
                </select>
              </Field>
              {draft.locationType === "magnetix_live" && (
                <Field label="Room format">
                  <select
                    value={draft.liveMode}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        liveMode: e.target.value as EventDraft["liveMode"],
                      })
                    }
                    className={input}
                  >
                    <option value="meeting">Meeting room</option>
                    <option value="broadcast">Broadcast</option>
                  </select>
                </Field>
              )}
              {draft.locationType === "external" && (
                <Field label="Meeting URL">
                  <input
                    type="url"
                    value={draft.externalUrl}
                    onChange={(e) =>
                      setDraft({ ...draft, externalUrl: e.target.value })
                    }
                    className={input}
                    placeholder="https://..."
                  />
                </Field>
              )}
              <Field label="Who can attend">
                <select
                  value={draft.channel}
                  onChange={(e) =>
                    setDraft({ ...draft, channel: e.target.value })
                  }
                  className={input}
                >
                  <option value="">Entire Community</option>
                  {categories.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </Field>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={draft.reminderEnabled}
                  onChange={(e) =>
                    setDraft({ ...draft, reminderEnabled: e.target.checked })
                  }
                />{" "}
                Save a one-day reminder preference{" "}
                <span
                  className="text-xs"
                  style={{ color: "var(--community-text-muted)" }}
                >
                  (delivery pending)
                </span>
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={draft.hideAttendees}
                  onChange={(e) =>
                    setDraft({ ...draft, hideAttendees: e.target.checked })
                  }
                />{" "}
                Hide attendees from regular members
              </label>
              <Field label="Event thumbnail">
                <div className="flex items-center gap-3">
                  {draft.thumbnailUrl ? (
                    <img
                      src={draft.thumbnailUrl}
                      alt="Event thumbnail preview"
                      className="h-20 w-32 rounded object-cover"
                    />
                  ) : (
                    <div
                      className="grid h-20 w-32 place-items-center rounded border"
                      style={{
                        borderColor: "var(--community-border)",
                        color: "var(--community-text-muted)",
                      }}
                    >
                      <ImagePlus className="h-5 w-5" />
                    </div>
                  )}
                  <label
                    className="cursor-pointer rounded-md border px-3 py-2 text-sm"
                    style={{ borderColor: "var(--community-border)" }}
                  >
                    <input
                      className="sr-only"
                      type="file"
                      accept="image/*"
                      onChange={(e) =>
                        e.target.files?.[0] &&
                        void uploadThumbnail(e.target.files[0])
                      }
                    />
                    {uploading ? "Uploading…" : "Upload image"}
                  </label>
                </div>
                <p
                  className="mt-1 text-xs"
                  style={{ color: "var(--community-text-muted)" }}
                >
                  Recommended 1280 × 720. Images are stored in Community
                  storage.
                </p>
              </Field>
            </>
          )}
          {step === "payment" && (
            <div className="space-y-3">
              <div
                className="rounded-lg border p-4"
                style={{
                  borderColor: "var(--community-primary)",
                  backgroundColor:
                    "color-mix(in srgb, var(--community-primary) 6%, var(--community-surface))",
                }}
              >
                <p className="flex items-center gap-2 font-medium">
                  <Radio
                    className="h-4 w-4"
                    style={{ color: "var(--community-primary)" }}
                  />{" "}
                  Free event
                </p>
                <p
                  className="mt-1 text-sm"
                  style={{ color: "var(--community-text-muted)" }}
                >
                  Members with event access can attend without payment.
                </p>
              </div>
              <div
                className="rounded-lg border p-4 text-sm"
                style={{
                  borderColor: "var(--community-border)",
                  color: "var(--community-text-muted)",
                }}
              >
                Paid events will attach to an existing Magnetix Offer when the
                entitlement flow is approved. This workflow does not create a
                second payment system.
              </div>
            </div>
          )}
        </div>
        <div
          className="flex justify-between border-t px-5 py-4"
          style={{ borderColor: "var(--community-border)" }}
        >
          <button
            className="rounded-md border px-3 py-2 text-sm"
            style={{ borderColor: "var(--community-border)" }}
            onClick={close}
          >
            Cancel
          </button>
          {step !== "payment" ? (
            <button
              className="rounded-md px-3 py-2 text-sm text-white"
              style={{ backgroundColor: "var(--community-primary-action)" }}
              onClick={() => setStep(step === "details" ? "access" : "payment")}
            >
              Next
            </button>
          ) : (
            <button
              disabled={saving || uploading}
              className="rounded-md px-3 py-2 text-sm text-white disabled:opacity-50"
              style={{ backgroundColor: "var(--community-primary-action)" }}
              onClick={() => void create()}
            >
              {saving ? "Creating…" : "Create Event"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
