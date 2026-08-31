"use client";

import Link from "next/link";
import { CalendarDays, ExternalLink, MapPin, Users, Video } from "lucide-react";
import { useState } from "react";
import type { CommunityEventViewModel } from "@/components/community/community-events-view";

function dateTime(value: number | null, timezone: string) {
  if (!value) return "Date TBD";
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: timezone,
  }).format(new Date(value));
}

export function CommunityEventDetailView({
  event: initial,
  apiPath,
  eventsHref,
  liveHref,
  moderator,
}: {
  event: CommunityEventViewModel;
  apiPath: string;
  eventsHref: string;
  liveHref: string;
  moderator: boolean;
}) {
  const [event, setEvent] = useState(initial);
  const [error, setError] = useState("");
  async function lifecycle(status: "live" | "ended" | "canceled") {
    const response = await fetch(apiPath, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventId: event.id, status }),
    });
    const data = (await response.json()) as {
      event?: CommunityEventViewModel;
      error?: string;
    };
    if (!response.ok || !data.event)
      return setError(data.error ?? "Unable to update event.");
    setEvent(data.event);
  }
  const location =
    event.locationType === "magnetix_live"
      ? "Magnetix Live Room"
      : event.locationType === "external"
        ? "External link"
        : "No online location";
  return (
    <div
      className="mx-auto max-w-4xl space-y-5"
      style={{ color: "var(--community-text)" }}
    >
      <Link
        href={eventsHref}
        className="text-sm font-medium"
        style={{ color: "var(--community-primary)" }}
      >
        ← Back to Events
      </Link>
      {error && (
        <p className="rounded-lg border border-red-400 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      )}
      <article
        className="overflow-hidden rounded-xl border"
        style={{
          borderColor: "var(--community-border)",
          backgroundColor: "var(--community-surface)",
        }}
      >
        {event.thumbnailUrl && (
          <img
            src={event.thumbnailUrl}
            alt=""
            className="h-56 w-full object-cover sm:h-72"
          />
        )}
        <div className="space-y-5 p-5 sm:p-7">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p
                className="text-sm font-medium capitalize"
                style={{ color: "var(--community-primary)" }}
              >
                {event.status}
              </p>
              <h1 className="mt-1 text-3xl font-semibold">{event.title}</h1>
            </div>
            <span
              className="rounded-full px-3 py-1 text-xs font-medium"
              style={{
                backgroundColor: `${event.accentColor || "var(--community-primary)"}22`,
                color: "var(--community-text)",
              }}
            >
              {location}
            </span>
          </div>
          <div
            className="grid gap-3 rounded-lg border p-4 text-sm sm:grid-cols-2"
            style={{
              borderColor: "var(--community-border)",
              backgroundColor: "var(--community-bg)",
            }}
          >
            <p className="flex gap-2">
              <CalendarDays
                className="mt-0.5 h-4 w-4 shrink-0"
                style={{ color: "var(--community-primary)" }}
              />
              <span>
                <b>Starts</b>
                <br />
                {dateTime(event.startAt, event.timezone)}
                <br />
                <span style={{ color: "var(--community-text-muted)" }}>
                  {event.timezone}
                </span>
              </span>
            </p>
            <p className="flex gap-2">
              <CalendarDays
                className="mt-0.5 h-4 w-4 shrink-0"
                style={{ color: "var(--community-primary)" }}
              />
              <span>
                <b>Ends</b>
                <br />
                {dateTime(event.endAt, event.timezone)}
              </span>
            </p>
            <p className="flex gap-2">
              <MapPin
                className="h-4 w-4 shrink-0"
                style={{ color: "var(--community-primary)" }}
              />
              <span>
                <b>Location</b>
                <br />
                {location}
                {event.channel ? ` · ${event.channel}` : " · Entire Community"}
              </span>
            </p>
            <p className="flex gap-2">
              <Users
                className="h-4 w-4 shrink-0"
                style={{ color: "var(--community-primary)" }}
              />
              <span>
                <b>Attendees</b>
                <br />
                {event.hideAttendees && !moderator
                  ? "Attendee list is private"
                  : "Attendance is available when members join."}
              </span>
            </p>
          </div>
          <div
            className="text-sm leading-6 whitespace-pre-wrap"
            style={{ color: "var(--community-text-muted)" }}
          >
            {event.description}
          </div>
          <div className="flex flex-wrap gap-2">
            {event.status === "live" &&
              event.locationType === "magnetix_live" && (
                <Link
                  href={liveHref}
                  className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-white"
                  style={{ backgroundColor: "var(--community-primary-action)" }}
                >
                  <Video className="h-4 w-4" /> Join Event
                </Link>
              )}
            {event.locationType === "external" && event.externalUrl && (
              <a
                href={event.externalUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-white"
                style={{ backgroundColor: "var(--community-primary-action)" }}
              >
                <ExternalLink className="h-4 w-4" /> Open event link
              </a>
            )}
            {event.status === "scheduled" &&
              event.locationType === "magnetix_live" && (
                <p
                  className="rounded-lg border px-3 py-2 text-sm"
                  style={{
                    borderColor: "var(--community-border)",
                    color: "var(--community-text-muted)",
                  }}
                >
                  This Magnetix Live Room will be available when the host starts
                  the event.
                </p>
              )}
            {event.status === "ended" && (
              <p
                className="rounded-lg border px-3 py-2 text-sm"
                style={{
                  borderColor: "var(--community-border)",
                  color: "var(--community-text-muted)",
                }}
              >
                This event has ended. No recording is available yet.
              </p>
            )}
            {moderator &&
              event.status === "scheduled" &&
              event.locationType === "magnetix_live" && (
                <button
                  onClick={() => void lifecycle("live")}
                  className="rounded-lg border px-3 py-2 text-sm"
                  style={{ borderColor: "var(--community-border)" }}
                >
                  Start Event
                </button>
              )}
            {moderator && event.status === "scheduled" && (
              <button
                onClick={() => void lifecycle("canceled")}
                className="rounded-lg border px-3 py-2 text-sm"
                style={{ borderColor: "var(--community-border)" }}
              >
                Cancel Event
              </button>
            )}
            {moderator && event.status === "live" && (
              <button
                onClick={() => void lifecycle("ended")}
                className="rounded-lg border px-3 py-2 text-sm"
                style={{ borderColor: "var(--community-border)" }}
              >
                End Event
              </button>
            )}
          </div>
        </div>
      </article>
    </div>
  );
}
