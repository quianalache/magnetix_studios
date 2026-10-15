"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowRightLeft,
  Building2,
  CalendarClock,
  CalendarDays,
  Check,
  CheckSquare,
  Clock,
  User,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatCurrency, daysSince } from "@/lib/format";
import type { Deal } from "@/types/deals";
import { DEFAULT_CARD_FIELDS, type CardFieldKey } from "@/types/pipeline-cards";
import type { DealNextActivity } from "@/types/pipeline-board";
import { useSubAccount } from "@/context/sub-account-context";
import { Tag } from "@/components/system/status-pill";
import { DealPriorityTag } from "@/components/pipeline/deal-priority";

/** The contact bits a card needs — a full Contact or the board's summary. */
export interface DealCardContact {
  id: string;
  name?: string | null;
  email?: string | null;
  company?: string | null;
}

interface DealCardProps {
  deal: Deal & { nextTask?: DealNextActivity | null; nextAppointment?: DealNextActivity | null };
  contact: DealCardContact | undefined;
  /** Customize Cards selection; defaults to the pre-customization layout. */
  fields?: CardFieldKey[];
  /** Resolved territory name for this deal. Only rendered when scoping is on. */
  territoryName?: string;
  dragging?: boolean;
  overlay?: boolean;
  listeners?: React.HTMLAttributes<HTMLElement>;
  attributes?: React.HTMLAttributes<HTMLElement>;
  setNodeRef?: (node: HTMLElement | null) => void;
  style?: React.CSSProperties;
  /** Single click opens the deal (Deal Details). */
  onOpen?: () => void;
  /**
   * Opens the mobile "move to stage" bottom sheet. Cross-column touch-drag
   * is fiddly on phones, so small screens get a tap affordance instead —
   * the button only renders below md (drag remains the desktop pattern).
   */
  onMoveRequest?: () => void;
  onCompletedChange?: () => void;
}

function formatDay(ymd: string): string {
  const d = new Date(`${ymd}T00:00:00`);
  return Number.isNaN(d.getTime())
    ? ymd
    : d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function formatWhen(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export function DealCard({
  deal,
  contact,
  fields = DEFAULT_CARD_FIELDS,
  territoryName,
  dragging,
  overlay,
  listeners,
  attributes,
  setNodeRef,
  style,
  onOpen,
  onMoveRequest,
  onCompletedChange,
}: DealCardProps) {
  const { saPath, subAccount } = useSubAccount();
  const scopingOn = subAccount?.territoryScopingEnabled === true;
  const show = (k: CardFieldKey) => fields.includes(k);

  // "Completed" tick, only shown on Won deals. Optimistic local state, synced
  // to the deal; persists via the shared deals PATCH route (which also fires
  // the optional Google review request).
  const [completed, setCompleted] = useState(!!deal.completed);
  const [savingCompleted, setSavingCompleted] = useState(false);
  useEffect(() => {
    setCompleted(!!deal.completed);
  }, [deal.completed]);

  async function toggleCompleted(e: React.MouseEvent) {
    e.stopPropagation();
    const next = !completed;
    setCompleted(next);
    setSavingCompleted(true);
    try {
      const res = await fetch(`/api/deals/${deal.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ completed: next }),
      });
      if (!res.ok) throw new Error("save failed");
      toast.success(next ? "Marked completed" : "Marked not completed");
      onCompletedChange?.();
    } catch {
      setCompleted(!next);
      toast.error("Couldn't update. Try again.");
    } finally {
      setSavingCompleted(false);
    }
  }

  const days = daysSince(deal.stageChangedAt);
  const daysLabel = days === 0 ? "today" : `${days}d in stage`;
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();

  return (
    <div
      ref={setNodeRef}
      style={style}
      role={onOpen && !overlay ? "button" : undefined}
      tabIndex={onOpen && !overlay ? 0 : undefined}
      aria-label={onOpen && !overlay ? `Open deal ${deal.title}` : undefined}
      className={cn(
        "group relative shrink-0 rounded-control border border-border bg-card px-3 py-2.5 text-body-sm shadow-card transition-[border-color,box-shadow,opacity] outline-none",
        !overlay && "cursor-pointer hover:border-violet-ds-300 focus-visible:ring-3 focus-visible:ring-ring/50",
        // Source card while dragging: a faded, dashed placeholder.
        dragging && "border-dashed border-violet-ds-300 opacity-40 shadow-none",
        overlay && "rotate-1 cursor-grabbing border-violet-ds-300 shadow-pop ring-2 ring-ring/40",
      )}
      {...attributes}
      {...listeners}
      onClick={onOpen && !overlay ? onOpen : undefined}
      onKeyDown={
        onOpen && !overlay
          ? (e) => {
              if (e.key === "Enter") onOpen();
            }
          : undefined
      }
    >
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 pr-1 leading-snug font-semibold [overflow-wrap:anywhere] text-foreground">{deal.title}</p>
        {show("priority") && <DealPriorityTag priority={deal.priority} className="mt-px shrink-0" />}
      </div>

      {show("value") && (
        <p className="mt-0.5 font-semibold text-foreground tabular-nums">{formatCurrency(deal.value, deal.currency)}</p>
      )}

      <div className="mt-1.5 space-y-0.5 text-caption text-muted-foreground [&_svg]:text-ink-tertiary">
        {show("contact") && (
          <div className="flex items-center gap-1.5">
            <User className="size-3.5 shrink-0" aria-hidden="true" />
            {contact ? (
              <Link
                href={saPath(`/contacts/${contact.id}`)}
                className="min-w-0 truncate hover:text-link hover:underline"
                onClick={stop}
                onPointerDown={stop}
                onKeyDown={stop}
              >
                {contact.name || contact.email || "Contact"}
              </Link>
            ) : (
              <span className="text-ink-tertiary italic">Unknown contact</span>
            )}
          </div>
        )}
        {show("company") && contact?.company && (
          <div className="flex items-center gap-1.5">
            <Building2 className="size-3.5 shrink-0" aria-hidden="true" />
            <span className="truncate">{contact.company}</span>
          </div>
        )}
        {show("expectedCloseDate") && deal.expectedCloseDate && (
          <div className="flex items-center gap-1.5">
            <CalendarDays className="size-3.5 shrink-0" aria-hidden="true" />
            <span>Closes {formatDay(deal.expectedCloseDate)}</span>
          </div>
        )}
        {show("nextTask") && deal.nextTask && (
          <div className="flex items-center gap-1.5">
            <CheckSquare className="size-3.5 shrink-0" aria-hidden="true" />
            <span className="truncate">
              {deal.nextTask.title}
              {deal.nextTask.at && ` · ${formatDay(deal.nextTask.at.slice(0, 10))}`}
            </span>
          </div>
        )}
        {show("nextAppointment") && deal.nextAppointment && (
          <div className="flex items-center gap-1.5">
            <CalendarClock className="size-3.5 shrink-0" aria-hidden="true" />
            <span className="truncate">
              {deal.nextAppointment.title}
              {deal.nextAppointment.at && ` · ${formatWhen(deal.nextAppointment.at)}`}
            </span>
          </div>
        )}
        {show("timeInStage") && (
          <div className="flex items-center gap-1.5">
            <Clock className="size-3.5 shrink-0" aria-hidden="true" />
            <span>{daysLabel}</span>
          </div>
        )}
      </div>

      {scopingOn && territoryName && (
        <span className="mt-1.5 inline-block" title={`Territory: ${territoryName}`}>
          <Tag color="gray" className="px-1.5 py-0 text-micro">
            {territoryName}
          </Tag>
        </span>
      )}

      {onMoveRequest && !overlay && (
        <button
          type="button"
          onPointerDown={stop}
          onClick={(e) => {
            e.stopPropagation();
            onMoveRequest();
          }}
          className="mt-2 flex min-h-10 w-full items-center justify-center gap-1.5 rounded-control border border-border px-2 py-1.5 text-caption font-medium text-link transition-colors active:bg-tint-violet md:hidden"
        >
          <ArrowRightLeft className="size-3.5" aria-hidden="true" />
          Move stage
        </button>
      )}

      {deal.stageId === "won" && (
        <button
          type="button"
          onPointerDown={stop}
          onClick={overlay ? undefined : toggleCompleted}
          disabled={overlay || savingCompleted}
          title={
            completed
              ? "Job delivered — click to unmark"
              : "Mark the job as delivered (can trigger a Google review request)"
          }
          className={cn(
            "mt-2 flex w-full items-center gap-2 rounded-control border px-2 py-1.5 text-caption font-medium transition-colors",
            completed
              ? "border-status-success-dot/40 bg-status-success-bg text-status-success-fg"
              : "border-dashed border-border-strong/60 text-muted-foreground hover:border-status-success-dot/50 hover:text-status-success-fg",
          )}
        >
          <span
            className={cn(
              "flex size-4 shrink-0 items-center justify-center rounded border",
              completed ? "border-status-success-dot bg-status-success-dot text-white" : "border-border-strong",
            )}
          >
            {completed && <Check className="size-3" aria-hidden="true" />}
          </span>
          {completed ? "Completed" : "Mark completed"}
        </button>
      )}
    </div>
  );
}
