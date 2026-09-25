import type { ReactNode } from "react";
import {
  Activity,
  AlertTriangle,
  BellRing,
  Bot,
  CalendarCheck,
  CalendarClock,
  CalendarPlus,
  CalendarX,
  CheckCircle2,
  CheckSquare,
  CircleSlash,
  DollarSign,
  Eye,
  FileSignature,
  FileText,
  GitBranch,
  GraduationCap,
  Mail,
  MailX,
  MapPinned,
  MessageSquare,
  MessageSquareOff,
  MessagesSquare,
  Pencil,
  PhoneMissed,
  PhoneOutgoing,
  Send,
  ShoppingBag,
  Star,
  UserCheck,
  UserMinus,
  UserX,
  Users,
  XCircle,
  Zap,
} from "lucide-react";

/**
 * Icon + label for every contact activity type (Contacts redesign,
 * 2026-09-25). Fixes the old timeline's fall-through, where anything
 * without an explicit case — the AI reply / escalation / skip rows, the
 * Watchdog flag — rendered as "Note added". Unknown or future types now
 * render as a neutral "Activity", never as a different event.
 *
 * Unsubscribe / STOP rows are stored as `automation_step_skipped` with a
 * `meta.kind`; they're labelled as the preference change they are.
 */
export function activityVisuals(
  type: string,
  meta?: Record<string, unknown> | null,
): { icon: ReactNode; label: string } {
  const i = (Icon: typeof Activity, tone: string) => (
    <Icon className={`h-3.5 w-3.5 ${tone}`} aria-hidden="true" />
  );
  const kind = meta?.kind;

  if (type === "automation_step_skipped") {
    if (kind === "email_opt_out") {
      return { icon: i(MailX, "text-rose-500"), label: "Unsubscribed from email" };
    }
    if (kind === "sms_opt_out") {
      return meta?.optedOut === false
        ? { icon: i(MessageSquare, "text-emerald-500"), label: "Resubscribed to SMS" }
        : { icon: i(MessageSquareOff, "text-rose-500"), label: "Opted out of SMS" };
    }
    if (kind === "whatsapp_opt_out") {
      return meta?.optedOut === false
        ? { icon: i(MessagesSquare, "text-emerald-500"), label: "Resubscribed to WhatsApp" }
        : { icon: i(MessageSquareOff, "text-rose-500"), label: "Opted out of WhatsApp" };
    }
  }
  if (
    (type === "community_access_revoked" || type === "course_access_revoked") &&
    meta?.accessRetained === true
  ) {
    return { icon: i(UserMinus, "text-amber-500"), label: "Complimentary access removed" };
  }

  switch (type) {
    case "note_added":
      return { icon: i(Pencil, "text-muted-foreground"), label: "Note added" };
    case "pipeline_moved":
      return { icon: i(GitBranch, "text-indigo-500"), label: "Pipeline updated" };
    case "booking_created":
      return { icon: i(CalendarCheck, "text-emerald-500"), label: "Event scheduled" };
    case "task_completed":
      return { icon: i(CheckSquare, "text-emerald-500"), label: "Task completed" };
    case "form_submitted":
      return { icon: i(FileText, "text-violet-500"), label: "Form submitted" };
    case "email_sent":
      return { icon: i(Mail, "text-blue-500"), label: "Email sent" };
    case "sms_sent":
      return { icon: i(MessageSquare, "text-violet-500"), label: "SMS sent" };
    case "whatsapp_sent":
      return { icon: i(MessagesSquare, "text-green-500"), label: "WhatsApp sent" };
    case "messenger_sent":
      return { icon: i(MessagesSquare, "text-blue-500"), label: "Messenger sent" };
    case "instagram_sent":
      return { icon: i(MessagesSquare, "text-pink-500"), label: "Instagram sent" };
    case "voice_call_initiated":
      return { icon: i(PhoneOutgoing, "text-orange-500"), label: "AI call placed" };
    case "missed_call":
      return { icon: i(PhoneMissed, "text-rose-500"), label: "Missed call" };
    case "automation_started":
      return { icon: i(Zap, "text-amber-500"), label: "Automation started" };
    case "automation_step_sent":
      return { icon: i(Send, "text-violet-500"), label: "Automation step sent" };
    case "automation_step_skipped":
      return { icon: i(CircleSlash, "text-muted-foreground"), label: "Automation step skipped" };
    case "automation_completed":
      return { icon: i(CheckCircle2, "text-emerald-500"), label: "Automation completed" };
    case "automation_failed":
      return { icon: i(AlertTriangle, "text-rose-500"), label: "Automation failed" };
    case "ai_reply_sent":
      return { icon: i(Bot, "text-violet-500"), label: "AI agent replied" };
    case "ai_escalated":
      return { icon: i(BellRing, "text-amber-500"), label: "AI escalated to the team" };
    case "ai_skipped":
      return { icon: i(Bot, "text-muted-foreground"), label: "AI reply skipped" };
    case "ai_agent_flagged":
      return { icon: i(BellRing, "text-amber-500"), label: "Flagged for follow-up" };
    case "quote_sent":
      return { icon: i(FileSignature, "text-blue-500"), label: "Quote sent" };
    case "quote_viewed":
      return { icon: i(Eye, "text-indigo-500"), label: "Quote viewed" };
    case "quote_accepted":
      return { icon: i(CheckCircle2, "text-emerald-500"), label: "Quote accepted" };
    case "quote_declined":
      return { icon: i(XCircle, "text-rose-500"), label: "Quote declined" };
    case "quote_marked_paid":
      return { icon: i(DollarSign, "text-emerald-500"), label: "Quote paid" };
    case "review_requested":
      return { icon: i(Star, "text-amber-500"), label: "Review requested" };
    case "contact_territory_changed":
      return { icon: i(MapPinned, "text-sky-500"), label: "Territory changed" };
    case "booking_page_booked":
      return { icon: i(CalendarPlus, "text-teal-500"), label: "Meeting booked" };
    case "booking_payment_received":
      return { icon: i(DollarSign, "text-emerald-500"), label: "Booking payment received" };
    case "booking_cancelled":
      return { icon: i(CalendarX, "text-rose-500"), label: "Meeting cancelled" };
    case "booking_rescheduled":
      return { icon: i(CalendarClock, "text-amber-500"), label: "Meeting rescheduled" };
    case "booking_no_show":
      return { icon: i(UserX, "text-rose-500"), label: "No-show" };
    case "booking_completed":
      return { icon: i(CheckCircle2, "text-emerald-500"), label: "Meeting completed" };
    case "booking_reassigned":
      return { icon: i(Users, "text-indigo-500"), label: "Booking reassigned" };
    case "purchase_completed":
      return { icon: i(ShoppingBag, "text-emerald-500"), label: "Purchase" };
    case "course_enrolled":
      return { icon: i(GraduationCap, "text-indigo-500"), label: "Course enrollment" };
    case "community_access_granted":
      return { icon: i(UserCheck, "text-emerald-500"), label: "Community access granted" };
    case "community_access_revoked":
      return { icon: i(UserMinus, "text-rose-500"), label: "Community access removed" };
    case "course_access_granted":
      return { icon: i(GraduationCap, "text-emerald-500"), label: "Course access granted" };
    case "course_access_revoked":
      return { icon: i(UserMinus, "text-rose-500"), label: "Course access removed" };
    default:
      return { icon: i(Activity, "text-muted-foreground"), label: "Activity" };
  }
}
