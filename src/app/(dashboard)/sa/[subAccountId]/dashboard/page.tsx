"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  TrendingUp,
  UserPlus,
  MessageCircle,
  CalendarClock,
  CheckCircle2,
  Send,
  ArrowRight,
  Sparkles,
  Upload,
  Download,
  Users,
} from "lucide-react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { useAuth } from "@/hooks/use-auth";
import { useSubAccount } from "@/context/sub-account-context";
import { useEffectiveTerritoryFilter } from "@/hooks/use-effective-territory-filter";
import { useUnreadConversationsCount } from "@/hooks/use-unread-conversations";
import { getFirebaseDb } from "@/lib/firebase/client";
import { subscribeToContacts } from "@/lib/firestore/contacts";
import { subscribeToDeals } from "@/lib/firestore/deals";
import { subscribeToEvents } from "@/lib/firestore/events";
import { subscribeToQuotes } from "@/lib/firestore/quotes";
import { computeQuoteTotals } from "@/lib/quotes/calc";
import { formatCurrency, toDate } from "@/lib/format";
import { eventStatus } from "@/types/events";
import type { CalendarEvent } from "@/types/events";
import type { Deal } from "@/types/deals";
import { usePipelineStages } from "@/hooks/use-pipeline-stages";
import type { Contact } from "@/types/contacts";
import type { Quote } from "@/types/quotes";
import type { BroadcastDoc } from "@/types/broadcasts";
import { Button } from "@/components/ui/button";
import { StatCard } from "@/components/ui/stat-card";
import { NewDealDialog } from "@/components/pipeline/new-deal-dialog";
import { LeadsMap } from "@/components/dashboard/leads-map";

const STAGE_BAR_COLORS: Record<string, string> = {
  new: "bg-slate-400 dark:bg-slate-500",
  contacted: "bg-blue-400 dark:bg-blue-500",
  qualified: "bg-indigo-400 dark:bg-indigo-500",
  proposal: "bg-amber-400 dark:bg-amber-500",
  won: "bg-emerald-400 dark:bg-emerald-500",
  lost: "bg-rose-400 dark:bg-rose-500",
};

type ActivityKind = "lead" | "won" | "sent" | "paid";

interface ActivityItem {
  id: string;
  kind: ActivityKind;
  title: React.ReactNode;
  meta: string;
  time: number;
}

export default function DashboardPage() {
  const { user } = useAuth();
  const { subAccountId, agencyId, saPath } = useSubAccount();
  const { ready: filterReady, filter: territoryFilter } =
    useEffectiveTerritoryFilter();
  const unreadConversations = useUnreadConversationsCount();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [recentBroadcasts, setRecentBroadcasts] = useState<BroadcastDoc[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user || !agencyId) return;
    // Hold off until the territory filter resolves so scoped collaborators
    // don't trip permission-denied on the contacts/deals listeners (rules
    // aren't filters — see lib/firestore/territory-query.ts). Admins /
    // owners / scoping-off resolve synchronously, so no perceptible delay.
    if (!filterReady) return;
    const scope = { agencyId, subAccountId };
    let dealsReady = false;
    let contactsReady = false;
    const settle = () => {
      if (dealsReady && contactsReady) setLoading(false);
    };
    const unsubC = subscribeToContacts(scope, { territoryFilter }, (l) => {
      setContacts(l);
      contactsReady = true;
      settle();
    });
    const unsubD = subscribeToDeals(scope, { territoryFilter }, (l) => {
      setDeals(l);
      dealsReady = true;
      settle();
    });
    const unsubE = subscribeToEvents(scope, { territoryFilter }, setEvents);
    const unsubQ = subscribeToQuotes(scope, { territoryFilter }, setQuotes);
    const broadcastsQ = query(
      collection(getFirebaseDb(), "broadcasts"),
      where("subAccountId", "==", subAccountId),
    );
    const unsubB = onSnapshot(broadcastsQ, (snap) => {
      setRecentBroadcasts(
        snap.docs.map((d) => ({ id: d.id, ...d.data() }) as BroadcastDoc),
      );
    });
    return () => {
      unsubC();
      unsubD();
      unsubE();
      unsubQ();
      unsubB();
    };
  }, [user, agencyId, subAccountId, filterReady, territoryFilter]);

  const displayName = (user?.displayName ?? user?.email ?? "").split("@")[0];

  const openDeals = useMemo(
    () => deals.filter((d) => d.stageId !== "won" && d.stageId !== "lost"),
    [deals],
  );
  const currency = deals[0]?.currency ?? "USD";
  const pipelineValue = openDeals.reduce((s, d) => s + (d.value || 0), 0);

  const { todayStart, todayEnd } = useMemo(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return { todayStart: start, todayEnd: end };
  }, []);

  const newLeadsToday = useMemo(
    () =>
      contacts.filter((c) => {
        const d = toDate(c.createdAt);
        return d && d.getTime() >= todayStart.getTime();
      }).length,
    [contacts, todayStart],
  );

  const bookingsToday = useMemo(
    () =>
      events
        .filter((e) => eventStatus(e) === "scheduled")
        .filter((e) => {
          const d = toDate(e.startAt);
          return (
            d && d.getTime() >= todayStart.getTime() && d.getTime() < todayEnd.getTime()
          );
        })
        .sort(
          (a, b) => (toDate(a.startAt)?.getTime() ?? 0) - (toDate(b.startAt)?.getTime() ?? 0),
        ),
    [events, todayStart, todayEnd],
  );

  const saleToday = useMemo(() => {
    const wonDealToday = deals.some((d) => {
      if (d.stageId !== "won") return false;
      const d2 = toDate(d.stageChangedAt);
      return d2 && d2.getTime() >= todayStart.getTime();
    });
    const paidQuoteToday = quotes.some((q) => {
      if (q.status !== "paid") return false;
      const d = toDate(q.paidAt);
      return d && d.getTime() >= todayStart.getTime();
    });
    return wonDealToday || paidQuoteToday;
  }, [deals, quotes, todayStart]);

  const contactById = useMemo(() => {
    const m = new Map<string, Contact>();
    for (const c of contacts) m.set(c.id, c);
    return m;
  }, [contacts]);

  const stages = usePipelineStages();
  const stageCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of stages) m.set(s.id, 0);
    for (const d of deals) m.set(d.stageId, (m.get(d.stageId) ?? 0) + 1);
    return m;
  }, [deals, stages]);

  const activityItems = useMemo(() => {
    const items: ActivityItem[] = [];

    for (const c of contacts) {
      const d = toDate(c.createdAt);
      if (!d) continue;
      items.push({
        id: `lead-${c.id}`,
        kind: "lead",
        title: (
          <>
            New lead — <b className="font-semibold">{c.name || c.email || "Unnamed"}</b>
          </>
        ),
        meta: c.source || c.company || "—",
        time: d.getTime(),
      });
    }

    for (const d of deals) {
      if (d.stageId !== "won") continue;
      const changed = toDate(d.stageChangedAt);
      if (!changed) continue;
      const c = contactById.get(d.contactId);
      items.push({
        id: `won-${d.id}`,
        kind: "won",
        title: (
          <>
            Deal marked <b className="font-semibold">Won</b> — {d.title}
          </>
        ),
        meta: `${formatCurrency(d.value, d.currency)}${c?.name ? ` · ${c.name}` : ""}`,
        time: changed.getTime(),
      });
    }

    for (const b of recentBroadcasts) {
      if (b.status !== "completed") continue;
      const sent = toDate(b.completedAt) ?? toDate(b.createdAt);
      if (!sent) continue;
      items.push({
        id: `sent-${b.id}`,
        kind: "sent",
        title: (
          <>
            Broadcast sent — <b className="font-semibold">{b.subjectPreview || "Untitled"}</b>
          </>
        ),
        meta: `${b.totals?.sent ?? 0} recipients`,
        time: sent.getTime(),
      });
    }

    for (const q of quotes) {
      if (q.status !== "paid") continue;
      const paid = toDate(q.paidAt);
      if (!paid) continue;
      const c = contactById.get(q.contactId);
      const { total } = computeQuoteTotals(q);
      items.push({
        id: `paid-${q.id}`,
        kind: "paid",
        title: (
          <>
            {q.kind === "invoice" ? "Invoice" : "Quote"} paid —{" "}
            <b className="font-semibold">{c?.name ?? "Unknown"}</b>
          </>
        ),
        meta: formatCurrency(total, q.currency),
        time: paid.getTime(),
      });
    }

    return items.sort((a, b) => b.time - a.time).slice(0, 6);
  }, [contacts, deals, recentBroadcasts, quotes, contactById]);

  const isEmpty = !loading && contacts.length === 0 && deals.length === 0;
  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  const subtitle = useMemo(() => {
    if (isEmpty) return "Let's get your first lead in.";
    const parts: string[] = [];
    if (newLeadsToday > 0) {
      parts.push(`${newLeadsToday} new lead${newLeadsToday === 1 ? "" : "s"} today`);
    }
    if (bookingsToday.length > 0) {
      parts.push(
        `${bookingsToday.length} booking${bookingsToday.length === 1 ? "" : "s"} scheduled`,
      );
    }
    if (saleToday) parts.push("a sale came in");
    if (parts.length === 0) return "Here's what's moving in your pipeline.";
    if (parts.length === 1) return `${parts[0]}.`;
    return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}.`;
  }, [isEmpty, newLeadsToday, bookingsToday.length, saleToday]);

  return (
    <div className="momentum-scope mx-auto w-full max-w-5xl space-y-6 rounded-2xl">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {today}
          </p>
          <h1 className="mt-1 text-3xl font-extrabold tracking-tight text-balance sm:text-4xl">
            {greeting}
            {displayName ? `, ${displayName}` : ""}. Here&apos;s{" "}
            <span className="mx-gradient-text text-primary">
              what&apos;s moving
            </span>{" "}
            today.
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
        </div>
        {!isEmpty && (
          <div className="flex items-center gap-2">
            <NewDealDialog contacts={contacts} />
          </div>
        )}
      </div>

      {!loading && unreadConversations > 0 && (
        <Link
          href={saPath("/conversations")}
          className="mx-banner-gradient flex flex-col gap-4 rounded-2xl bg-gradient-to-r from-indigo-500 to-violet-500 p-6 text-white shadow-sm transition-transform hover:-translate-y-px sm:flex-row sm:items-center sm:justify-between"
        >
          <div>
            <p className="mb-1.5 text-[10.5px] font-bold uppercase tracking-wider text-white/75">
              Needs a reply
            </p>
            <h2 className="text-lg font-bold tracking-tight">
              {unreadConversations} conversation
              {unreadConversations === 1 ? "" : "s"} waiting for a reply
            </h2>
            <p className="text-sm text-white/85">
              Catch up in your unified inbox.
            </p>
          </div>
          <span className="inline-flex shrink-0 items-center gap-1.5 self-start rounded-[11px] bg-white px-4 py-2.5 text-sm font-bold text-primary sm:self-auto">
            Open inbox <ArrowRight className="h-3.5 w-3.5" />
          </span>
        </Link>
      )}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          href={saPath("/contacts")}
          icon={<UserPlus className="h-4 w-4" />}
          label="New leads today"
          value={String(newLeadsToday)}
          hint={`${contacts.length} total`}
          tone="text-[#A8386B] dark:text-[#F3D9D7]"
          iconBg="bg-[#F3D9D7]/50 dark:bg-[#F3D9D7]/15"
          loading={loading}
        />
        <StatCard
          href={saPath("/pipeline")}
          icon={<TrendingUp className="h-4 w-4" />}
          label="Open pipeline value"
          value={formatCurrency(pipelineValue, currency)}
          hint={`${openDeals.length} open deals`}
          tone="text-[#5E2574] dark:text-[#C892DE]"
          iconBg="bg-[#5E2574]/10 dark:bg-[#C892DE]/15"
          loading={loading}
        />
        <StatCard
          href={saPath("/conversations")}
          icon={<MessageCircle className="h-4 w-4" />}
          label="Unread conversations"
          value={String(unreadConversations)}
          hint="Across your inbox"
          tone="text-teal-700 dark:text-[#9EDBDD]"
          iconBg="bg-[#9EDBDD]/25 dark:bg-[#9EDBDD]/15"
          loading={loading}
        />
        <StatCard
          href={saPath("/calendar")}
          icon={<CalendarClock className="h-4 w-4" />}
          label="Bookings today"
          value={String(bookingsToday.length)}
          hint={bookingsToday.length ? "Scheduled" : "Nothing on the calendar"}
          tone="text-[#6E1F49] dark:text-[#E8B7C8]"
          iconBg="bg-[#E8B7C8]/50 dark:bg-[#E8B7C8]/20"
          loading={loading}
        />
      </div>

      <LeadsMap contacts={contacts} deals={deals} />

      {isEmpty ? (
        <GettingStarted />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
          <section className="rounded-2xl border bg-card p-5">
            <div className="mb-1 flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold">Recent activity</h2>
                <p className="text-xs text-muted-foreground">
                  Across every channel, newest first.
                </p>
              </div>
            </div>
            {activityItems.length === 0 ? (
              <p className="py-8 text-center text-xs text-muted-foreground">
                Nothing has happened yet — once you get a lead, a won deal, or a
                sale, it&apos;ll show up here.
              </p>
            ) : (
              <ul className="mt-3 divide-y">
                {activityItems.map((item) => {
                  const dotStyle =
                    item.kind === "lead"
                      ? "bg-[#F3D9D7] text-[#A8386B]"
                      : item.kind === "sent"
                        ? "bg-[#F3E4F0] text-[#5E2574] dark:bg-[#341E42] dark:text-[#C892DE]"
                        : "bg-[#9EDBDD]/40 text-[#1D7A7C]";
                  const Icon =
                    item.kind === "lead"
                      ? UserPlus
                      : item.kind === "sent"
                        ? Send
                        : CheckCircle2;
                  return (
                    <li key={item.id} className="flex items-start gap-3 py-2.5">
                      <span
                        className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${dotStyle}`}
                      >
                        <Icon className="h-3.5 w-3.5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm">{item.title}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {item.meta}
                        </p>
                      </div>
                      <span className="shrink-0 whitespace-nowrap pt-0.5 text-[11px] text-muted-foreground">
                        {relativeTime(item.time)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <div className="space-y-4">
            <section className="rounded-2xl border bg-card p-5">
              <h2 className="text-sm font-semibold">Today&apos;s bookings</h2>
              <p className="mb-3 text-xs text-muted-foreground">
                {bookingsToday.length > 0
                  ? `${bookingsToday.length} scheduled.`
                  : "Nothing on the calendar today."}
              </p>
              {bookingsToday.length === 0 ? (
                <p className="py-4 text-center text-xs text-muted-foreground">
                  No bookings today.
                </p>
              ) : (
                <ul className="space-y-2">
                  {bookingsToday.map((e) => {
                    const start = toDate(e.startAt);
                    const contact = e.contactId
                      ? contactById.get(e.contactId)
                      : null;
                    return (
                      <li key={e.id}>
                        <Link
                          href={saPath("/calendar")}
                          className="flex items-center gap-3 rounded-lg bg-muted/50 p-2.5 transition-colors hover:bg-muted"
                        >
                          <span className="flex w-16 shrink-0 items-center justify-center rounded-lg bg-accent px-1 py-2 text-center text-[11px] font-bold tabular-nums text-accent-foreground">
                            {start
                              ? start.toLocaleTimeString("en-US", {
                                  hour: "numeric",
                                  minute: "2-digit",
                                })
                              : "--"}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">
                              {e.title}
                            </p>
                            <p className="truncate text-xs text-muted-foreground">
                              {contact?.name ? `with ${contact.name}` : "No contact linked"}
                            </p>
                          </div>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            <section className="rounded-2xl border bg-card p-5">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold">Pipeline</h2>
                <Button
                  render={<Link href={saPath("/pipeline")} />}
                  size="sm"
                  variant="ghost"
                  className="gap-1"
                >
                  Open <ArrowRight className="h-3 w-3" />
                </Button>
              </div>
              <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-muted">
                {stages.map((s) => {
                  const count = stageCounts.get(s.id) ?? 0;
                  if (!count || deals.length === 0) return null;
                  return (
                    <span
                      key={s.id}
                      className={`h-full ${STAGE_BAR_COLORS[s.id] ?? "bg-primary"}`}
                      style={{ width: `${(count / deals.length) * 100}%` }}
                    />
                  );
                })}
              </div>
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
                {stages.map((s) => (
                  <span
                    key={s.id}
                    className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground"
                  >
                    <span
                      className={`h-2 w-2 rounded-sm ${STAGE_BAR_COLORS[s.id] ?? "bg-primary"}`}
                    />
                    {s.label} ({stageCounts.get(s.id) ?? 0})
                  </span>
                ))}
              </div>
            </section>
          </div>
        </div>
      )}
    </div>
  );
}

function relativeTime(ms: number): string {
  const diffSec = Math.round((Date.now() - ms) / 1000);
  const diffMin = Math.round(diffSec / 60);
  const diffHr = Math.round(diffMin / 60);
  const diffDay = Math.round(diffHr / 24);
  if (diffSec < 30) return "just now";
  if (diffMin < 1) return `${diffSec}s ago`;
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay < 7) return `${diffDay}d ago`;
  return new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function GettingStarted() {
  const { saPath } = useSubAccount();
  return (
    <div className="mx-wash-gradient rounded-2xl border border-dashed bg-gradient-to-br from-indigo-500/5 via-violet-500/5 to-pink-500/5 p-10 text-center">
      <div className="mx-hero-gradient mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 via-violet-500 to-pink-500 text-white">
        <Sparkles className="h-6 w-6" />
      </div>
      <h2 className="text-xl font-semibold tracking-tight">
        Let&apos;s get your first lead in
      </h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
        Add a single contact, or migrate your whole list from another CRM by
        uploading a CSV.
      </p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
        <Button render={<Link href={saPath("/contacts")} />}>
          <Users className="mr-1 h-4 w-4" />
          Add your first contact
        </Button>
        <Button
          variant="outline"
          render={<Link href={`${saPath("/contacts")}?import=1`} />}
        >
          <Upload className="mr-1 h-4 w-4" />
          Upload CSV
        </Button>
        <Button
          variant="ghost"
          size="sm"
          render={
            <a
              href="/contacts-template.csv"
              download="leadstack-contacts-template.csv"
            />
          }
        >
          <Download className="mr-1 h-3.5 w-3.5" />
          Download template
        </Button>
      </div>
      <p className="mt-3 text-[11px] text-muted-foreground">
        Template columns: <code>name, email, phone, company, source, tags</code>
      </p>
    </div>
  );
}
