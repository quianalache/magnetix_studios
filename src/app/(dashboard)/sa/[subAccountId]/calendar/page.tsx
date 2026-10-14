"use client";

import { useEffect, useState } from "react";
import { CalendarDays } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useSubAccount } from "@/context/sub-account-context";
import { subscribeToContacts } from "@/lib/firestore/contacts";
import { subscribeToEvents } from "@/lib/firestore/events";
import { subscribeToTasks } from "@/lib/firestore/tasks";
import { subscribeToProjects } from "@/lib/firestore/projects";
import { subscribeToExternalCalendarEvents } from "@/lib/firestore/external-calendar-events";
import { safeSubscribe } from "@/lib/firestore/safe-subscribe";
import { useEffectiveTerritoryFilter } from "@/hooks/use-effective-territory-filter";
import type { CalendarEvent } from "@/types/events";
import type { Contact } from "@/types/contacts";
import type { Task } from "@/types/tasks";
import type { ExternalCalendarEvent } from "@/types/google-calendar";
import type { Project } from "@/types/projects";
import { CalendarView } from "@/components/calendar/calendar-view";
import { PageShell } from "@/components/system/page-shell";
import { PageHeader } from "@/components/system/page-header";
import { Skeleton } from "@/components/ui/skeleton";

export default function CalendarPage() {
  const { user, loading: authLoading } = useAuth();
  const { subAccountId, agencyId } = useSubAccount();
  const { ready: filterReady, filter: territoryFilter } =
    useEffectiveTerritoryFilter();
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [googleEvents, setGoogleEvents] = useState<ExternalCalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading || !user || !agencyId) return;
    if (!filterReady) return;
    setLoading(true);
    const scope = { agencyId, subAccountId };
    let eventsReady = false;
    let contactsReady = false;
    let tasksReady = false;
    let googleEventsReady = false;
    const unsubP = safeSubscribe(
      () => subscribeToProjects(scope, (l) => setProjects(l), () => setProjects([])),
      () => setProjects([])
    );
    const settle = () => {
      if (eventsReady && contactsReady && tasksReady && googleEventsReady) {
        setLoading(false);
      }
    };
    // safeSubscribe (2026-08-30 CRM-wide stability pass) — see its own
    // doc comment. Calendar has the most concurrent listeners of any
    // page in the app (4), making it a high-leverage spot for this fix.
    const unsubE = safeSubscribe(
      () =>
        subscribeToEvents(scope, { territoryFilter }, (l) => {
          setEvents(l);
          eventsReady = true;
          settle();
        }),
      () => {
        eventsReady = true;
        settle();
      },
    );
    const unsubC = safeSubscribe(
      () =>
        subscribeToContacts(scope, { territoryFilter }, (l) => {
          setContacts(l);
          contactsReady = true;
          settle();
        }),
      () => {
        contactsReady = true;
        settle();
      },
    );
    const unsubT = safeSubscribe(
      () =>
        subscribeToTasks(scope, { territoryFilter }, (l) => {
          setTasks(l);
          tasksReady = true;
          settle();
        }),
      () => {
        tasksReady = true;
        settle();
      },
    );
    const unsubG = safeSubscribe(
      () =>
        subscribeToExternalCalendarEvents(scope, user.uid, (l) => {
          setGoogleEvents(l);
          googleEventsReady = true;
          settle();
        }),
      () => {
        googleEventsReady = true;
        settle();
      },
    );
    return () => {
      unsubE?.();
      unsubC?.();
      unsubT?.();
      unsubG?.();
      unsubP?.();
    };
  }, [user, agencyId, subAccountId, authLoading, filterReady, territoryFilter]);

  return (
    <PageShell width="full" className="gap-5">
      <PageHeader
        title="Calendar"
        icon={CalendarDays}
        description="Manual events — meetings, calls, reminders. Click any day to add something."
      />

      {loading ? (
        <CalendarSkeleton />
      ) : (
        <CalendarView
          events={events}
          contacts={contacts}
          tasks={tasks.filter((t) => !t.archived && !(t.projectId && projects.some((p) => p.id === t.projectId && p.status === "archived")))}
          projects={projects}
          googleEvents={googleEvents}
        />
      )}
    </PageShell>
  );
}

function CalendarSkeleton() {
  return (
    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_320px]" aria-busy="true" aria-label="Loading calendar">
      <div className="overflow-hidden rounded-card border border-border bg-card shadow-card">
        <div className="flex items-center justify-between border-b border-border p-4">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-8 w-28" />
        </div>
        <div className="h-9 bg-table-head" />
        <div className="grid grid-cols-7">
          {Array.from({ length: 35 }).map((_, i) => (
            <div key={i} className="min-h-14 border-r border-b border-border-subtle p-1.5 sm:min-h-[104px]">
              {i % 5 === 0 && <Skeleton className="h-3 w-4" />}
            </div>
          ))}
        </div>
      </div>
      <Skeleton className="hidden h-72 rounded-card xl:block" />
    </div>
  );
}
