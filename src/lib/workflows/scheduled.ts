import "server-only";

import { publishCallback } from "@/lib/automations/qstash";

/** Schedule one durable date/time trigger. This is per-enrollment state, not a
 * recurring QStash schedule, so it survives browser closure and deploys. */
export async function scheduleWorkflowDateTime(input: {
  subAccountId: string;
  agencyId: string;
  contactId: string;
  at: Date;
  deduplicationKey: string;
}) {
  const delaySeconds = Math.max(
    0,
    Math.ceil((input.at.getTime() - Date.now()) / 1000)
  );
  return publishCallback({
    pathname: "/api/workflows/scheduled",
    body: {
      subAccountId: input.subAccountId,
      agencyId: input.agencyId,
      contactId: input.contactId,
      scheduledAt: input.at.toISOString(),
      deduplicationKey: input.deduplicationKey,
    },
    delaySeconds,
    deduplicationId: `wf_date_${input.deduplicationKey.replace(/[^a-zA-Z0-9_-]/g, "_")}`,
  });
}
