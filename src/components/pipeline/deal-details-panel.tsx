"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  Building2,
  CalendarClock,
  CalendarPlus,
  CheckSquare,
  DollarSign,
  ExternalLink,
  Mail,
  MoreHorizontal,
  Pencil,
  Phone,
  Plus,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatCurrency, formatRelativeTime } from "@/lib/format";
import { useSubAccount } from "@/context/sub-account-context";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { OptionSelect } from "@/components/system/option-select";
import { StatusPill } from "@/components/system/status-pill";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ContactNotesPanel } from "@/components/contacts/contact-notes-panel";
import { activityVisuals } from "@/components/contacts/activity-visuals";
import { LostReasonDialog } from "@/components/pipeline/lost-reason-dialog";
import { EditDealDialog } from "@/components/pipeline/edit-deal-dialog";
import { TaskDialog } from "@/components/tasks/task-dialog";
import { EventDialog } from "@/components/calendar/event-dialog";
import { useDealFormOptions } from "@/hooks/use-deal-form-options";
import { fetchPipelines, PipelineApiError, patchDealApi } from "@/lib/pipelines/client";
import { DEAL_PRIORITIES, getPriority, type DealPriority } from "@/types/deals";
import { activeStages, findStage, type Pipeline } from "@/types/pipelines";
import { hydrateDealRow, type BoardDeal, type DealRowWire } from "@/types/pipeline-board";
import type { ContactActivityItem } from "@/types/contact-feed";
import type { TerritoryDoc } from "@/types";

/**
 * Deal Details (Multiple Pipelines, 2026-09-25) — the owner-approved
 * mockup with the owner's modifications, which take precedence:
 *   TOP    title, value + currency, pipeline, stage, priority, expected
 *          closing date, related contact, description, deal actions.
 *   CENTER exactly two tabs — Activity (deal-tagged events only) and
 *          Notes (deal-specific notes, separate from Contact notes).
 *   RIGHT  Next Steps (tasks linked to this deal, existing Tasks system)
 *          and Upcoming Appointment (existing Calendar/Booking records).
 * No Files tab / Recent Files card, no Tasks or Appointments tabs.
 */

interface RelatedTask {
  id: string;
  title: string;
  dueAt: string | null;
  completed: boolean;
}
interface RelatedAppointment {
  id: string;
  title: string;
  startAt: string | null;
  endAt: string | null;
  status: string;
  location: string;
  meetingUrl: string | null;
}

function formatDay(ymd: string | null | undefined): string {
  if (!ymd) return "";
  const d = new Date(ymd.length === 10 ? `${ymd}T00:00:00` : ymd);
  return Number.isNaN(d.getTime())
    ? ymd
    : d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function formatRange(start: string | null, end: string | null): string {
  if (!start) return "";
  const s = new Date(start);
  const day = s.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" });
  const t = (d: Date) => d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return end ? `${day} · ${t(s)} – ${t(new Date(end))}` : `${day} · ${t(s)}`;
}

/** Approved record/detail surfaces (Wave 4): white cards on the near-white sheet canvas. */
const PANEL = "rounded-card border border-border bg-card p-4 shadow-card";
const FIELD_LABEL = "mb-1 block text-caption font-medium text-muted-foreground";
const SECTION_TITLE = "flex items-center gap-2 text-section font-semibold text-foreground";

export function DealDetailsPanel({
  dealId,
  initial,
  open,
  onOpenChange,
  onChanged,
  territories,
}: {
  dealId: string | null;
  /** Board row for an instant first paint while the full deal loads. */
  initial?: BoardDeal | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Something about the deal changed — refresh the board/list. */
  onChanged: () => void;
  territories: TerritoryDoc[];
}) {
  const { subAccountId, saPath } = useSubAccount();
  const [deal, setDeal] = useState<BoardDeal | null>(initial ?? null);
  const [pipeline, setPipeline] = useState<Pipeline | null>(null);
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [canDelete, setCanDelete] = useState(false);
  const [tab, setTab] = useState<"activity" | "notes">("activity");
  const [activity, setActivity] = useState<ContactActivityItem[] | null>(null);
  const [tasks, setTasks] = useState<RelatedTask[]>([]);
  const [upcoming, setUpcoming] = useState<RelatedAppointment[]>([]);
  const [relatedLoaded, setRelatedLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [movePipelineId, setMovePipelineId] = useState<string | null>(null);
  const [descDraft, setDescDraft] = useState<string | null>(null);
  const [lostOpen, setLostOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [taskOpen, setTaskOpen] = useState(false);
  const [eventOpen, setEventOpen] = useState(false);
  const { contacts } = useDealFormOptions({ open: taskOpen || eventOpen });

  const loadDeal = useCallback(async () => {
    if (!dealId) return;
    try {
      const res = await fetch(`/api/deals/${dealId}`, { cache: "no-store" });
      const body = (await res.json().catch(() => ({}))) as {
        deal?: DealRowWire;
        pipeline?: Pipeline | null;
        canDelete?: boolean;
        error?: string;
      };
      if (!res.ok || !body.deal) throw new Error(body.error ?? "Couldn't load this deal.");
      setDeal(hydrateDealRow(body.deal));
      setPipeline(body.pipeline ?? null);
      setCanDelete(body.canDelete === true);
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Couldn't load this deal.");
    }
  }, [dealId]);

  const loadActivity = useCallback(async () => {
    if (!dealId) return;
    try {
      const res = await fetch(`/api/deals/${dealId}/activity`, { cache: "no-store" });
      const body = (await res.json().catch(() => ({}))) as { items?: ContactActivityItem[] };
      setActivity(res.ok ? (body.items ?? []) : []);
    } catch {
      setActivity([]);
    }
  }, [dealId]);

  const loadRelated = useCallback(async () => {
    if (!dealId) return;
    try {
      const res = await fetch(`/api/deals/${dealId}/related`, { cache: "no-store" });
      const body = (await res.json().catch(() => ({}))) as {
        tasks?: RelatedTask[];
        upcoming?: RelatedAppointment[];
      };
      if (res.ok) {
        setTasks(body.tasks ?? []);
        setUpcoming(body.upcoming ?? []);
      }
    } finally {
      setRelatedLoaded(true);
    }
  }, [dealId]);

  useEffect(() => {
    if (!open || !dealId) return;
    setDeal(initial ?? null);
    setActivity(null);
    setRelatedLoaded(false);
    setTab("activity");
    setMovePipelineId(null);
    setDescDraft(null);
    void loadDeal();
    void loadActivity();
    void loadRelated();
    fetchPipelines(subAccountId)
      .then((r) => setPipelines(r.pipelines))
      .catch(() => setPipelines([]));
    // `initial` only seeds the first paint for this deal id.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, dealId, subAccountId]);

  const refreshAll = useCallback(() => {
    void loadDeal();
    void loadActivity();
    void loadRelated();
    onChanged();
  }, [loadDeal, loadActivity, loadRelated, onChanged]);

  async function patch(body: Record<string, unknown>, success?: string) {
    if (!deal) return;
    setSaving(true);
    try {
      await patchDealApi(deal.id, body);
      if (success) toast.success(success);
      refreshAll();
    } catch (err) {
      toast.error(err instanceof PipelineApiError ? err.message : "Couldn't save. Try again.");
    } finally {
      setSaving(false);
    }
  }

  async function completeTask(t: RelatedTask) {
    setTasks((list) => list.map((x) => (x.id === t.id ? { ...x, completed: true } : x)));
    try {
      const res = await fetch(`/api/tasks/${t.id}/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ completed: true }),
      });
      if (!res.ok) throw new Error();
      toast.success("Task completed");
      refreshAll();
    } catch {
      toast.error("Couldn't complete the task.");
      void loadRelated();
    }
  }

  async function deleteDeal() {
    if (!deal) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/deals/${deal.id}`, { method: "DELETE" });
      if (!res.ok) {
        const b = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(b.error ?? "Couldn't delete the deal.");
      }
      toast.success("Deal deleted");
      setDeleteOpen(false);
      onOpenChange(false);
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't delete the deal.");
    } finally {
      setSaving(false);
    }
  }

  const stageList = pipeline ? pipeline.stages.filter((s) => !s.archived || s.id === deal?.stageId) : [];
  const movingTo = movePipelineId ? pipelines.find((p) => p.id === movePipelineId) : null;
  const priority = deal ? getPriority(deal.priority) : null;
  const contact = deal?.contact ?? null;
  const openTasks = tasks.filter((t) => !t.completed);
  const nextAppointment = upcoming[0] ?? null;
  const archivedPipeline = pipeline?.status === "archived";

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="overflow-y-auto bg-background p-0 data-[side=right]:w-full data-[side=right]:sm:max-w-5xl">
          <SheetTitle className="sr-only">{deal?.title ?? "Deal details"}</SheetTitle>
          <SheetDescription className="sr-only">Deal details, activity, notes, next steps and appointments.</SheetDescription>
          {!deal ? (
            <div role="status" className="p-8 text-body-sm text-muted-foreground">
              {loadError ?? "Loading…"}
            </div>
          ) : (
            <div className="space-y-4 p-4 sm:p-6">
              {/* Header */}
              <div className="flex flex-col gap-3 pr-8 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex min-w-0 flex-1 items-start gap-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-chip bg-tag-violet-bg text-tag-violet-fg" aria-hidden="true">
                    <DollarSign className="size-5" />
                  </span>
                  <div className="min-w-0">
                    <h2 className="text-title-lg leading-tight font-semibold tracking-tight break-words text-foreground">{deal.title}</h2>
                    <p className="mt-1 flex flex-wrap gap-x-2 text-body-sm text-muted-foreground">
                      {contact?.name && <span>{contact.name}</span>}
                      {contact?.company && (
                        <>
                          <span aria-hidden>·</span>
                          <span>{contact.company}</span>
                        </>
                      )}
                      {deal.createdAt && (
                        <>
                          <span aria-hidden>·</span>
                          <span>Added {formatDay(new Date(deal.createdAt as unknown as Date).toISOString())}</span>
                        </>
                      )}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  <DropdownMenu>
                    <DropdownMenuTrigger render={<Button variant="outline" size="icon" aria-label="More deal actions" />}>
                      <MoreHorizontal className="size-4" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-44">
                      <DropdownMenuItem onClick={() => setEditOpen(true)}>
                        <Pencil className="size-4" /> Edit deal
                      </DropdownMenuItem>
                      {canDelete && (
                        <DropdownMenuItem variant="destructive" onClick={() => setDeleteOpen(true)}>
                          <Trash2 className="size-4" /> Delete deal
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                  {deal.stageId === "won" ? (
                    <StatusPill tone="success" className="h-8 px-3">
                      Won
                    </StatusPill>
                  ) : (
                    <Button
                      variant="outline"
                      disabled={saving || archivedPipeline}
                      onClick={() => patch({ stageId: "won" }, "Marked as won")}
                    >
                      Mark as Won
                    </Button>
                  )}
                  {deal.stageId === "lost" ? (
                    <span title={deal.lostReason ?? undefined} className="max-w-full">
                      <StatusPill tone="danger" className="h-8 max-w-full truncate px-3">
                        Lost{deal.lostReason ? ` · ${deal.lostReason}` : ""}
                      </StatusPill>
                    </span>
                  ) : (
                    <Button
                      variant="outline"
                      className="text-status-danger-fg hover:bg-status-danger-bg hover:text-status-danger-fg"
                      disabled={saving || archivedPipeline}
                      onClick={() => setLostOpen(true)}
                    >
                      Mark as Lost
                    </Button>
                  )}
                </div>
              </div>

              {archivedPipeline && (
                <Alert tone="warning">
                  This deal&apos;s pipeline is archived — restore the pipeline to move or close the deal.
                </Alert>
              )}

              {/* Key fields */}
              <div className={cn(PANEL, "grid gap-4 sm:grid-cols-2 lg:grid-cols-5")}>
                <div>
                  <p className={FIELD_LABEL}>Value</p>
                  <p className="text-title-md font-semibold text-foreground tabular-nums">{formatCurrency(deal.value, deal.currency)}</p>
                  <p className="text-caption text-muted-foreground">{deal.currency}</p>
                </div>
                <div>
                  <span className={FIELD_LABEL}>Pipeline</span>
                  <OptionSelect
                    aria-label="Pipeline"
                    value={movePipelineId ?? pipeline?.id ?? null}
                    disabled={saving || pipelines.length === 0}
                    onChange={(v) => v && setMovePipelineId(v === pipeline?.id ? null : v)}
                    options={[
                      ...(pipeline && !pipelines.some((p) => p.id === pipeline.id)
                        ? [{ value: pipeline.id, label: pipeline.name }]
                        : []),
                      ...pipelines.map((p) => ({ value: p.id, label: p.name })),
                    ]}
                  />
                </div>
                <div>
                  <span className={FIELD_LABEL}>{movingTo ? `Stage in ${movingTo.name}` : "Stage"}</span>
                  {movingTo ? (
                    <OptionSelect
                      aria-label={`Stage in ${movingTo.name}`}
                      className="border-violet-ds-300 ring-3 ring-ring/20"
                      value={null}
                      placeholder="Choose a stage…"
                      disabled={saving}
                      onChange={(v) => {
                        if (!v) return;
                        void patch({ pipelineId: movingTo.id, stageId: v }, `Moved to ${movingTo.name}`).then(() =>
                          setMovePipelineId(null),
                        );
                      }}
                      options={activeStages(movingTo).map((s) => ({ value: s.id, label: s.name }))}
                    />
                  ) : (
                    <OptionSelect
                      aria-label="Stage"
                      value={deal.stageId}
                      disabled={saving || archivedPipeline}
                      onChange={(v) => {
                        if (!v || v === deal.stageId) return;
                        if (v === "lost") setLostOpen(true);
                        else void patch({ stageId: v }, "Stage updated");
                      }}
                      options={[
                        ...(!findStage(pipeline ?? { stages: [] }, deal.stageId)
                          ? [{ value: deal.stageId, label: deal.stageId }]
                          : []),
                        ...stageList.map((s) => ({ value: s.id, label: `${s.name}${s.archived ? " (archived)" : ""}` })),
                      ]}
                    />
                  )}
                </div>
                <div>
                  <span className={FIELD_LABEL}>Priority</span>
                  <OptionSelect
                    aria-label="Priority"
                    value={deal.priority}
                    disabled={saving}
                    onChange={(v) => v && v !== deal.priority && void patch({ priority: v as DealPriority }, "Priority updated")}
                    options={DEAL_PRIORITIES.map((p) => ({ value: p.id, label: p.label }))}
                  />
                  {priority && <span className="sr-only">{priority.label}</span>}
                </div>
                <label className="block">
                  <span className={FIELD_LABEL}>Expected closing date</span>
                  <Input
                    type="date"
                    value={deal.expectedCloseDate ?? ""}
                    disabled={saving}
                    onChange={(e) => void patch({ expectedCloseDate: e.target.value || null }, "Closing date updated")}
                  />
                </label>
              </div>

              {/* Contact + company */}
              <div className="grid gap-4 md:grid-cols-2">
                <div className={PANEL}>
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <h3 className={SECTION_TITLE}>Contact</h3>
                    {contact && (
                      <Button variant="outline" size="sm" render={<Link href={saPath(`/contacts/${contact.id}`)} />}>
                        View Contact
                      </Button>
                    )}
                  </div>
                  {contact ? (
                    <div className="space-y-1 text-body-sm">
                      <Link
                        href={saPath(`/contacts/${contact.id}`)}
                        className="inline-flex items-center gap-1 font-semibold text-link hover:underline"
                      >
                        {contact.name || contact.email || "Contact"}
                        <ExternalLink className="size-3.5" aria-hidden="true" />
                      </Link>
                      {contact.email && (
                        <p className="flex min-w-0 items-center gap-1.5 text-muted-foreground">
                          <Mail className="size-3.5 shrink-0" aria-hidden="true" /> <span className="truncate">{contact.email}</span>
                        </p>
                      )}
                      {contact.phone && (
                        <p className="flex items-center gap-1.5 text-muted-foreground">
                          <Phone className="size-3.5 shrink-0" aria-hidden="true" /> {contact.phone}
                        </p>
                      )}
                    </div>
                  ) : (
                    <p className="text-body-sm text-muted-foreground italic">No contact linked.</p>
                  )}
                </div>
                <div className={PANEL}>
                  <h3 className={cn(SECTION_TITLE, "mb-2")}>Company</h3>
                  {contact?.company ? (
                    <p className="flex items-center gap-2 text-body-sm font-semibold">
                      <Building2 className="size-4 text-muted-foreground" aria-hidden="true" /> {contact.company}
                    </p>
                  ) : (
                    <p className="text-body-sm text-muted-foreground">No company on the contact.</p>
                  )}
                </div>
              </div>

              {/* Description */}
              <div className={PANEL}>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <h3 className={SECTION_TITLE}>Deal Description</h3>
                  {descDraft === null && (
                    <Button variant="outline" size="sm" onClick={() => setDescDraft(deal.description ?? "")}>
                      <Pencil className="size-3.5" aria-hidden="true" /> Edit
                    </Button>
                  )}
                </div>
                {descDraft !== null ? (
                  <div className="space-y-2">
                    <Textarea
                      value={descDraft}
                      maxLength={5000}
                      rows={4}
                      onChange={(e) => setDescDraft(e.target.value)}
                      aria-label="Deal description"
                      autoFocus
                    />
                    <div className="flex justify-end gap-2">
                      <Button variant="ghost" size="sm" onClick={() => setDescDraft(null)} disabled={saving}>
                        Cancel
                      </Button>
                      <Button
                        size="sm"
                        disabled={saving}
                        onClick={() =>
                          void patch({ description: descDraft.trim() || null }, "Description saved").then(() =>
                            setDescDraft(null),
                          )
                        }
                      >
                        Save
                      </Button>
                    </div>
                  </div>
                ) : deal.description ? (
                  <p className="text-body-sm leading-relaxed whitespace-pre-wrap">{deal.description}</p>
                ) : (
                  <p className="text-body-sm text-muted-foreground">No description yet.</p>
                )}
              </div>

              {/* Center tabs + right rail */}
              <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
                <div className={cn(PANEL, "min-w-0")}>
                  <div role="tablist" aria-label="Deal feed" className="mb-4 flex gap-6 border-b border-border">
                    {(["activity", "notes"] as const).map((t) => (
                      <button
                        key={t}
                        type="button"
                        role="tab"
                        aria-selected={tab === t}
                        onClick={() => setTab(t)}
                        className={cn(
                          "-mb-px border-b-2 pb-2.5 text-body-sm capitalize outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                          tab === t
                            ? "border-primary font-semibold text-foreground"
                            : "border-transparent font-medium text-muted-foreground hover:text-foreground",
                        )}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                  {tab === "activity" ? (
                    activity === null ? (
                      <div className="h-24 animate-pulse rounded-control bg-muted" aria-busy="true" aria-label="Loading activity" />
                    ) : activity.length === 0 ? (
                      <p className="py-6 text-center text-body-sm text-muted-foreground">No activity for this deal yet.</p>
                    ) : (
                      <ul className="space-y-3">
                        {activity.map((item) => {
                          const v = activityVisuals(item.type, item.meta);
                          return (
                            <li key={item.id} className="flex gap-3">
                              <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-surface-sunken">
                                {v.icon}
                              </span>
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-baseline justify-between gap-x-2">
                                  <p className="text-body-sm font-medium text-foreground">{v.label}</p>
                                  <time className="text-caption text-muted-foreground" dateTime={item.createdAt}>
                                    {formatRelativeTime(new Date(item.createdAt))}
                                  </time>
                                </div>
                                {item.content && <p className="text-body-sm break-words text-muted-foreground">{item.content}</p>}
                                {item.actorName && <p className="text-caption text-muted-foreground">by {item.actorName}</p>}
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    )
                  ) : (
                    <ContactNotesPanel contactId={deal.contactId} notesUrl={`/api/deals/${deal.id}/notes`} />
                  )}
                </div>

                <div className="space-y-4">
                  <section className={PANEL} aria-label="Next steps">
                    <h3 className={cn(SECTION_TITLE, "mb-3")}>
                      <span className="flex size-7 items-center justify-center rounded-chip bg-tag-blue-bg text-tag-blue-fg" aria-hidden="true">
                        <CheckSquare className="size-4" />
                      </span>
                      Next Steps
                    </h3>
                    {!relatedLoaded ? (
                      <div className="h-16 animate-pulse rounded-control bg-muted" />
                    ) : openTasks.length === 0 ? (
                      <p className="text-body-sm text-muted-foreground">No open tasks for this deal.</p>
                    ) : (
                      <ul className="space-y-2">
                        {openTasks.map((t) => (
                          <li key={t.id} className="flex items-start gap-2 text-body-sm">
                            <button
                              type="button"
                              aria-label={`Complete "${t.title}"`}
                              onClick={() => void completeTask(t)}
                              className="mt-0.5 size-4 shrink-0 rounded border border-border-strong outline-none hover:border-primary focus-visible:ring-3 focus-visible:ring-ring/50"
                            />
                            <span className="min-w-0 flex-1 break-words">{t.title}</span>
                            {t.dueAt && (
                              <span
                                className={cn(
                                  "shrink-0 text-caption",
                                  Date.parse(t.dueAt) < Date.now() ? "text-destructive" : "text-muted-foreground",
                                )}
                              >
                                {formatDay(t.dueAt)}
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                    <div className="mt-3 flex flex-col gap-2">
                      <Button variant="outline" size="sm" onClick={() => setTaskOpen(true)}>
                        <Plus className="size-4" aria-hidden="true" /> Add Task
                      </Button>
                      <Link href={saPath("/projects/tasks")} className="text-center text-caption text-link hover:underline">
                        Open Tasks
                      </Link>
                    </div>
                  </section>

                  <section className={PANEL} aria-label="Upcoming appointment">
                    <h3 className={cn(SECTION_TITLE, "mb-3")}>
                      <span className="flex size-7 items-center justify-center rounded-chip bg-tag-aqua-bg text-tag-aqua-fg" aria-hidden="true">
                        <CalendarClock className="size-4" />
                      </span>
                      Upcoming Appointment
                    </h3>
                    {!relatedLoaded ? (
                      <div className="h-16 animate-pulse rounded-control bg-muted" />
                    ) : nextAppointment ? (
                      <div className="text-body-sm">
                        <p className="font-semibold text-foreground">{nextAppointment.title}</p>
                        <p className="text-muted-foreground">{formatRange(nextAppointment.startAt, nextAppointment.endAt)}</p>
                        {nextAppointment.location && <p className="text-muted-foreground">{nextAppointment.location}</p>}
                        {upcoming.length > 1 && (
                          <p className="mt-1 text-caption text-muted-foreground">+{upcoming.length - 1} more scheduled</p>
                        )}
                      </div>
                    ) : (
                      <p className="text-body-sm text-muted-foreground">No upcoming appointment for this deal.</p>
                    )}
                    <div className="mt-3 flex flex-col gap-2">
                      <Button variant="outline" size="sm" onClick={() => setEventOpen(true)}>
                        <CalendarPlus className="size-4" aria-hidden="true" /> Schedule
                      </Button>
                      <Link href={saPath("/calendar")} className="text-center text-caption text-link hover:underline">
                        View in Calendar
                      </Link>
                    </div>
                  </section>
                </div>
              </div>
              {loadError && (
                <p role="alert" className="flex items-center gap-2 text-caption text-destructive">
                  <AlertCircle className="size-3.5" aria-hidden="true" /> {loadError}
                </p>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>

      <LostReasonDialog
        open={lostOpen}
        dealTitle={deal?.title}
        onCancel={() => setLostOpen(false)}
        onConfirm={async (reason) => {
          setLostOpen(false);
          await patch({ stageId: "lost", lostReason: reason }, "Marked as lost");
        }}
      />

      <EditDealDialog
        deal={editOpen ? deal : null}
        open={editOpen}
        onOpenChange={setEditOpen}
        territories={territories}
        onSaved={refreshAll}
      />

      <TaskDialog
        open={taskOpen}
        onOpenChange={setTaskOpen}
        contacts={contacts}
        defaultContactId={deal?.contactId ?? null}
        defaultDealId={deal?.id ?? null}
        onSaved={refreshAll}
      />

      <EventDialog
        open={eventOpen}
        onOpenChange={setEventOpen}
        contacts={contacts}
        defaultContactId={deal?.contactId ?? null}
        dealId={deal?.id ?? null}
        onSaved={refreshAll}
      />

      <Dialog open={deleteOpen} onOpenChange={(o) => !o && !saving && setDeleteOpen(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete this deal?</DialogTitle>
            <DialogDescription>
              &ldquo;{deal?.title}&rdquo; and its deal notes will be removed. The contact, their notes and
              linked tasks or appointments are kept. This can&apos;t be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={deleteDeal} disabled={saving}>
              {saving ? "Deleting…" : "Delete deal"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
