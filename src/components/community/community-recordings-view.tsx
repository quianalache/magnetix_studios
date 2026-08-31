import Link from "next/link";
import { MonitorPlay } from "lucide-react";

export function CommunityRecordingsView({
  eventsHref,
}: {
  eventsHref: string;
}) {
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
      <section
        className="rounded-xl border p-6 sm:p-8"
        style={{
          borderColor: "var(--community-border)",
          backgroundColor: "var(--community-surface)",
        }}
      >
        <h1 className="text-2xl font-semibold">Session Recordings</h1>
        <p
          className="mt-1 text-sm"
          style={{ color: "var(--community-text-muted)" }}
        >
          Access your Community session recordings in one place.
        </p>
        <div
          className="mt-6 grid place-items-center rounded-xl border border-dashed px-5 py-16 text-center"
          style={{ borderColor: "var(--community-border)" }}
        >
          <MonitorPlay
            className="h-10 w-10"
            style={{ color: "var(--community-primary)" }}
          />
          <h2 className="mt-3 font-semibold">No recordings yet</h2>
          <p
            className="mt-1 max-w-sm text-sm"
            style={{ color: "var(--community-text-muted)" }}
          >
            Your recorded Community sessions will appear here after recording is
            enabled.
          </p>
        </div>
      </section>
    </div>
  );
}
