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
  Activity,
  GitBranch,
  LayoutDashboard,
  type LucideIcon,
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
import { usePipelineLabels } from "@/hooks/use-pipeline-labels";
import { CurrencyTotalsText } from "@/components/pipeline/currency-totals";
import { activeStages, dealPipelineId } from "@/types/pipelines";
import type { CurrencyTotals } from "@/types/pipeline-board";
import type { Contact } from "@/types/contacts";
import type { Quote } from "@/types/quotes";
import type { BroadcastDoc } from "@/types/broadcasts";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageShell } from "@/components/system/page-shell";
import { PageHeader } from "@/components/system/page-header";
import { MomentHero } from "@/components/system/moment-hero";
import { MetricCard } from "@/components/system/metric-card";
import { EmptyState } from "@/components/system/empty-state";
import { cn } from "@/lib/utils";
import { NewDealDialog } from "@/components/pipeline/new-deal-dialog";
import { LeadsMap } from "@/components/dashboard/leads-map";

// Pipeline stages draw from the categorical chart palette; custom stages
// rotate through it so every stage gets a distinct, on-system color.
const STAGE_CHART_VAR: Record<string, number> = {
  new: 8,
  contacted: 4,
  qualified: 1,
  proposal: 5,
  won: 6,
  lost: 3,
};
function stageColor(stageId: string, index: number): string {
  const n = STAGE_CHART_VAR[stageId] ?? (index % 8) + 1;
  return `var(--ds-chart-${n})`;
}

type ChipTone = "violet" | "aqua" | "pink" | "blue" | "gold" | "green";
const CHIP_TONE: Record<ChipTone, string> = {
  violet: "bg-tag-violet-bg text-tag-violet-fg",
  aqua: "bg-tag-aqua-bg text-tag-aqua-fg",
  pink: "bg-tag-pink-bg text-tag-pink-fg",
  blue: "bg-tag-blue-bg text-tag-blue-fg",
  gold: "bg-tag-gold-bg text-tag-gold-fg",
  green: "bg-tag-green-bg text-tag-green-fg",
};

type ActivityKind = "lead" | "won" | "sent" | "paid";

const ACTIVITY_VISUAL: Record<ActivityKind, { Icon: LucideIcon; tone: ChipTone }> = {
  lead: { Icon: UserPlus, tone: "aqua" },
  won: { Icon: CheckCircle2, tone: "green" },
  sent: { Icon: Send, tone: "violet" },
  paid: { Icon: CheckCircle2, tone: "green" },
};

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
  // Never sum across currencies (Multiple Pipelines, 2026-09-25).
  const pipelineValue = useMemo(() => {
    const t: CurrencyTotals = {};
    for (const d of openDeals) {
      const c = (d.currency || "USD").toUpperCase();
      t[c] = (t[c] ?? 0) + (d.value || 0);
    }
    return t;
  }, [openDeals]);

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

  // Pipeline snapshot: one pipeline → its own stages; several → a row per
  // active pipeline. Deals only count toward their own pipeline.
  const { pipelines } = usePipelineLabels();
  const activePipelines = useMemo(
    () => pipelines.filter((p) => p.status === "active"),
    [pipelines],
  );
  const onlyPipeline = activePipelines.length === 1 ? activePipelines[0] : null;
  const stages = useMemo(
    () =>
      onlyPipeline
        ? activeStages(onlyPipeline).map((s) => ({ id: s.id, label: s.name }))
        : [],
    [onlyPipeline],
  );
  const snapshotDeals = useMemo(
    () => (onlyPipeline ? deals.filter((d) => dealPipelineId(d) === onlyPipeline.id) : deals),
    [deals, onlyPipeline],
  );
  const stageCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of stages) m.set(s.id, 0);
    for (const d of snapshotDeals) m.set(d.stageId, (m.get(d.stageId) ?? 0) + 1);
    return m;
  }, [snapshotDeals, stages]);
  const perPipeline = useMemo(
    () =>
      activePipelines.map((p) => {
        const mine = openDeals.filter((d) => dealPipelineId(d) === p.id);
        const value: CurrencyTotals = {};
        for (const d of mine) {
          const c = (d.currency || "USD").toUpperCase();
          value[c] = (value[c] ?? 0) + (d.value || 0);
        }
        return { pipeline: p, open: mine.length, value };
      }),
    [activePipelines, openDeals],
  );

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

  const firstWord = displayName ? displayName.split(/[\s._-]/)[0] : "";
  const firstName = firstWord ? firstWord.charAt(0).toUpperCase() + firstWord.slice(1) : "";

  return (
    <PageShell width="data">
      <PageHeader
        variant="moment"
        icon={LayoutDashboard}
        title="Dashboard"
        description="Your hub for leads, bookings and sales."
        actions={!isEmpty ? <NewDealDialog contacts={contacts} /> : undefined}
      />

      <MomentHero
        eyebrow={`${today}${firstName ? ` · Welcome back, ${firstName}` : ""}`}
        title={
          <>
            {greeting}. Here&apos;s <em className="text-link">what&apos;s moving</em> today.
          </>
        }
        description={subtitle}
      />

      {!loading && unreadConversations > 0 && (
        <Card variant="tint" tint="violet" className="flex-col gap-4 px-5 py-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-tag-violet-bg text-tag-violet-fg">
              <MessageCircle className="size-5" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <p className="text-micro font-semibold uppercase tracking-[0.14em] text-link">Needs a reply</p>
              <h2 className="text-section font-semibold text-foreground">
                {unreadConversations} conversation{unreadConversations === 1 ? "" : "s"} waiting for a reply
              </h2>
              <p className="text-body-sm text-muted-foreground">Catch up in your unified inbox.</p>
            </div>
          </div>
          <Button render={<Link href={saPath("/conversations")} />} className="self-start sm:self-auto">
            Open inbox <ArrowRight className="size-3.5" aria-hidden="true" />
          </Button>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-2.5 sm:gap-4 xl:grid-cols-4">
        <MetricCard
          href={saPath("/contacts")}
          icon={UserPlus}
          tone="aqua"
          label="New leads today"
          value={String(newLeadsToday)}
          hint={`${contacts.length} total`}
          loading={loading}
        />
        <MetricCard
          href={saPath("/pipeline")}
          icon={TrendingUp}
          tone="violet"
          label="Open pipeline value"
          value={<CurrencyTotalsText totals={pipelineValue} />}
          hint={`${openDeals.length} open deals`}
          loading={loading}
        />
        <MetricCard
          href={saPath("/conversations")}
          icon={MessageCircle}
          tone="pink"
          label="Unread conversations"
          value={String(unreadConversations)}
          hint="Across your inbox"
          loading={loading}
        />
        <MetricCard
          href={saPath("/calendar")}
          icon={CalendarClock}
          tone="blue"
          label="Bookings today"
          value={String(bookingsToday.length)}
          hint={bookingsToday.length ? "Scheduled" : "Nothing on the calendar"}
          loading={loading}
        />
      </div>

      <LeadsMap contacts={contacts} deals={deals} />

      {isEmpty ? (
        <GettingStarted />
      ) : (
        <div className="grid gap-4 lg:grid-cols-12">
          <DashboardCard
            className="lg:col-span-7"
            icon={Activity}
            tone="gold"
            title="Recent activity"
            description="Across every channel, newest first."
          >
            {activityItems.length === 0 ? (
              <p className="py-8 text-center text-body-sm text-muted-foreground">
                Nothing has happened yet — once you get a lead, a won deal, or a
                sale, it&apos;ll show up here.
              </p>
            ) : (
              <ul className="divide-y divide-border-subtle">
                {activityItems.map((item) => {
                  const { Icon, tone } = ACTIVITY_VISUAL[item.kind];
                  return (
                    <li key={item.id} className="flex items-start gap-3 py-2.5">
                      <span className={cn("mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full", CHIP_TONE[tone])}>
                        <Icon className="size-4" aria-hidden="true" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-body-sm text-foreground">{item.title}</p>
                        <p className="truncate text-caption text-muted-foreground">{item.meta}</p>
                      </div>
                      <span className="shrink-0 whitespace-nowrap pt-0.5 text-caption text-ink-tertiary">
                        {relativeTime(item.time)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </DashboardCard>

          <div className="flex flex-col gap-4 lg:col-span-5">
            <DashboardCard
              icon={CalendarClock}
              tone="blue"
              title="Today's bookings"
              description={
                bookingsToday.length > 0
                  ? `${bookingsToday.length} scheduled.`
                  : "Nothing on the calendar today."
              }
            >
              {bookingsToday.length === 0 ? (
                <p className="py-4 text-center text-body-sm text-muted-foreground">No bookings today.</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {bookingsToday.map((e) => {
                    const start = toDate(e.startAt);
                    const contact = e.contactId ? contactById.get(e.contactId) : null;
                    return (
                      <li key={e.id}>
                        <Link
                          href={saPath("/calendar")}
                          className="flex items-center gap-3 rounded-lg border border-border-subtle p-2.5 transition-colors hover:bg-muted"
                        >
                          <span className="flex w-16 shrink-0 items-center justify-center rounded-md bg-tag-blue-bg px-1 py-2 text-center text-caption font-semibold tabular-nums text-tag-blue-fg">
                            {start
                              ? start.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
                              : "--"}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-body-sm font-medium text-foreground">{e.title}</p>
                            <p className="truncate text-caption text-muted-foreground">
                              {contact?.name ? `with ${contact.name}` : "No contact linked"}
                            </p>
                          </div>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </DashboardCard>

            <DashboardCard
              icon={GitBranch}
              tone="violet"
              title="Pipeline"
              action={
                <Button render={<Link href={saPath("/pipeline")} />} size="sm" variant="ghost" className="gap-1 text-link">
                  Open <ArrowRight className="size-3" aria-hidden="true" />
                </Button>
              }
            >
              {onlyPipeline ? (
                <>
                  <div className="flex h-2 overflow-hidden rounded-full bg-muted">
                    {stages.map((s, i) => {
                      const count = stageCounts.get(s.id) ?? 0;
                      if (!count || snapshotDeals.length === 0) return null;
                      return (
                        <span
                          key={s.id}
                          className="h-full"
                          style={{ width: `${(count / snapshotDeals.length) * 100}%`, background: stageColor(s.id, i) }}
                        />
                      );
                    })}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
                    {stages.map((s, i) => (
                      <span key={s.id} className="inline-flex items-center gap-1.5 text-caption text-muted-foreground">
                        <span className="size-2 rounded-sm" style={{ background: stageColor(s.id, i) }} />
                        {s.label} ({stageCounts.get(s.id) ?? 0})
                      </span>
                    ))}
                  </div>
                </>
              ) : (
                <ul className="flex flex-col gap-1">
                  {perPipeline.map(({ pipeline, open, value }) => (
                    <li key={pipeline.id}>
                      <Link
                        href={saPath(`/pipeline/${pipeline.id}`)}
                        className="flex items-center justify-between gap-3 rounded-lg px-2 py-1.5 text-body-sm hover:bg-muted"
                      >
                        <span className="min-w-0 truncate font-medium text-foreground">{pipeline.name}</span>
                        <span className="shrink-0 text-caption text-muted-foreground">
                          {open} open ·{" "}
                          <CurrencyTotalsText totals={value} className="font-medium text-foreground" />
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </DashboardCard>
          </div>
        </div>
      )}
    </PageShell>
  );
}

/** One self-contained dashboard widget: chip + title header, then content. */
function DashboardCard({
  icon: Icon,
  tone,
  title,
  description,
  action,
  className,
  children,
}: {
  icon: LucideIcon;
  tone: ChipTone;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={cn("flex min-w-0 flex-col gap-3 rounded-card border border-border bg-card p-5 shadow-card", className)}>
      <div className="flex items-start gap-3">
        <span className={cn("flex size-8 shrink-0 items-center justify-center rounded-lg", CHIP_TONE[tone])}>
          <Icon className="size-4" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-section font-semibold text-foreground">{title}</h2>
          {description ? <p className="text-caption text-muted-foreground">{description}</p> : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      {children}
    </section>
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
    <EmptyState
      icon={Sparkles}
      title="Let's get your first lead in"
      description="Add a single contact, or migrate your whole list from another CRM by uploading a CSV."
      action={
        <div className="flex flex-col items-center gap-3">
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button render={<Link href={saPath("/contacts")} />}>
              <Users className="size-4" aria-hidden="true" />
              Add your first contact
            </Button>
            <Button variant="outline" render={<Link href={`${saPath("/contacts")}?import=1`} />}>
              <Upload className="size-4" aria-hidden="true" />
              Upload CSV
            </Button>
            <Button
              variant="ghost"
              size="sm"
              render={<a href="/contacts-template.csv" download="leadstack-contacts-template.csv" />}
            >
              <Download className="size-3.5" aria-hidden="true" />
              Download template
            </Button>
          </div>
          <p className="text-caption text-muted-foreground">
            Template columns: <code>name, email, phone, company, source, tags</code>
          </p>
        </div>
      }
    />
  );
}
