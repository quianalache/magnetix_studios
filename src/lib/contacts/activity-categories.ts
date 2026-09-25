import type { ActivityType } from "@/types/contacts";

/**
 * Activity tab filter categories (Contacts redesign, 2026-09-25). Pure so
 * the activity API (server-side filtering) and the tab's filter menu share
 * one mapping. Unknown/future types fall into "other" — they still show
 * under "All activity", just never mislabelled.
 */

export type ActivityCategory =
  | "messages"
  | "meetings"
  | "sales"
  | "pipeline"
  | "forms"
  | "automation"
  | "access"
  | "notes"
  | "other";

export const ACTIVITY_FILTERS: { value: "all" | ActivityCategory; label: string }[] = [
  { value: "all", label: "All activity" },
  { value: "messages", label: "Messages & calls" },
  { value: "meetings", label: "Meetings & events" },
  { value: "sales", label: "Quotes & purchases" },
  { value: "pipeline", label: "Deals & tasks" },
  { value: "forms", label: "Forms" },
  { value: "access", label: "Courses & community" },
  { value: "automation", label: "Automations & AI" },
  { value: "notes", label: "Notes" },
];

const CATEGORY: Partial<Record<ActivityType, ActivityCategory>> = {
  email_sent: "messages",
  sms_sent: "messages",
  whatsapp_sent: "messages",
  messenger_sent: "messages",
  instagram_sent: "messages",
  voice_call_initiated: "messages",
  missed_call: "messages",
  review_requested: "messages",
  booking_created: "meetings",
  booking_page_booked: "meetings",
  booking_cancelled: "meetings",
  booking_rescheduled: "meetings",
  booking_no_show: "meetings",
  booking_completed: "meetings",
  booking_reassigned: "meetings",
  booking_payment_received: "sales",
  quote_sent: "sales",
  quote_viewed: "sales",
  quote_accepted: "sales",
  quote_declined: "sales",
  quote_marked_paid: "sales",
  purchase_completed: "sales",
  pipeline_moved: "pipeline",
  task_completed: "pipeline",
  contact_territory_changed: "pipeline",
  form_submitted: "forms",
  automation_started: "automation",
  automation_step_sent: "automation",
  automation_step_skipped: "automation",
  automation_completed: "automation",
  automation_failed: "automation",
  ai_reply_sent: "automation",
  ai_escalated: "automation",
  ai_skipped: "automation",
  ai_agent_flagged: "automation",
  course_enrolled: "access",
  community_access_granted: "access",
  community_access_revoked: "access",
  course_access_granted: "access",
  course_access_revoked: "access",
  note_added: "notes",
};

export function activityCategory(
  type: string,
  meta?: { kind?: unknown } | null,
): ActivityCategory {
  // Unsubscribe / STOP rows are stored as automation_step_skipped but are
  // messaging-preference events, not automation steps.
  if (
    type === "automation_step_skipped" &&
    (meta?.kind === "email_opt_out" ||
      meta?.kind === "sms_opt_out" ||
      meta?.kind === "whatsapp_opt_out")
  ) {
    return "messages";
  }
  return CATEGORY[type as ActivityType] ?? "other";
}
