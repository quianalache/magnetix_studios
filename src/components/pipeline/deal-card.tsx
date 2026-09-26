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
import { getPriority, type Deal } from "@/types/deals";
import { DEFAULT_CARD_FIELDS, type CardFieldKey } from "@/types/pipeline-cards";
import type { DealNextActivity } from "@/types/pipeline-board";
import { useSubAccount } from "@/context/sub-account-context";

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
  const priority = getPriority(deal.priority);
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();

  return (
    <div
      ref={setNodeRef}
      style={style}
      role={onOpen && !overlay ? "button" : undefined}
      tabIndex={onOpen && !overlay ? 0 : undefined}
      aria-label={onOpen && !overlay ? `Open deal ${deal.title}` : undefined}
      className={cn(
        "group relative rounded-xl border bg-card p-3 text-sm shadow-sm transition-all",
        !overlay && "cursor-pointer hover:border-primary/40 hover:shadow-md",
        dragging && "opacity-40",
        overlay && "rotate-1 scale-[1.02] cursor-grabbing shadow-lg ring-2 ring-primary/40",
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
        <p className="pr-1 font-semibold leading-snug">{deal.title}</p>
        {show("priority") && (
          <span
            className={cn(
              "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
              priority.badge,
            )}
          >
            {priority.label}
          </span>
        )}
      </div>

      {show("value") && (
        <p className="mt-1 font-semibold tabular-nums">{formatCurrency(deal.value, deal.currency)}</p>
      )}

      <div className="mt-2 space-y-1 text-xs text-muted-foreground">
        {show("contact") && (
          <div className="flex items-center gap-1.5">
            <User className="h-3.5 w-3.5 shrink-0" />
            {contact ? (
              <Link
                href={saPath(`/contacts/${contact.id}`)}
                className="min-w-0 truncate hover:text-primary hover:underline"
                onClick={stop}
                onPointerDown={stop}
                onKeyDown={stop}
              >
                {contact.name || contact.email || "Contact"}
              </Link>
            ) : (
              <span className="italic text-muted-foreground/60">Unknown contact</span>
            )}
          </div>
        )}
        {show("company") && contact?.company && (
          <div className="flex items-center gap-1.5">
            <Building2 className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{contact.company}</span>
          </div>
        )}
        {show("expectedCloseDate") && deal.expectedCloseDate && (
          <div className="flex items-center gap-1.5">
            <CalendarDays className="h-3.5 w-3.5 shrink-0" />
            <span>Closes {formatDay(deal.expectedCloseDate)}</span>
          </div>
        )}
        {show("nextTask") && deal.nextTask && (
          <div className="flex items-center gap-1.5">
            <CheckSquare className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">
              {deal.nextTask.title}
              {deal.nextTask.at && ` · ${formatDay(deal.nextTask.at.slice(0, 10))}`}
            </span>
          </div>
        )}
        {show("nextAppointment") && deal.nextAppointment && (
          <div className="flex items-center gap-1.5">
            <CalendarClock className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">
              {deal.nextAppointment.title}
              {deal.nextAppointment.at && ` · ${formatWhen(deal.nextAppointment.at)}`}
            </span>
          </div>
        )}
        {show("timeInStage") && (
          <div className="flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5 shrink-0" />
            <span>{daysLabel}</span>
          </div>
        )}
      </div>

      {scopingOn && territoryName && (
        <span
          className="mt-2 inline-block rounded-full bg-muted px-1.5 py-0.5 text-[9px] font-medium text-muted-foreground"
          title={`Territory: ${territoryName}`}
        >
          {territoryName}
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
          className="mt-2 flex min-h-10 w-full items-center justify-center gap-1.5 rounded-md border border-dashed px-2 py-1.5 text-xs font-medium text-muted-foreground transition-colors active:bg-muted md:hidden"
        >
          <ArrowRightLeft className="h-3.5 w-3.5" />
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
            "mt-2 flex w-full items-center gap-2 rounded-md border px-2 py-1.5 text-xs font-medium transition-colors",
            completed
              ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
              : "border-dashed text-muted-foreground hover:border-emerald-500/40 hover:text-emerald-700 dark:hover:text-emerald-400",
          )}
        >
          <span
            className={cn(
              "flex h-4 w-4 shrink-0 items-center justify-center rounded border",
              completed ? "border-emerald-500 bg-emerald-500 text-white" : "border-muted-foreground/40",
            )}
          >
            {completed && <Check className="h-3 w-3" />}
          </span>
          {completed ? "Completed" : "Mark completed"}
        </button>
      )}
    </div>
  );
}
