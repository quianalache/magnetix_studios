import "server-only";

import type { WorkflowTriggerType } from "@/types/workflows";

/** Small internal adapter: product services emit one typed envelope into the
 * existing contact-scoped workflow enrollment engine. */
export interface WorkflowEvent<
  T extends Record<string, unknown> = Record<string, unknown>,
> {
  eventId?: string | null;
  eventType: WorkflowTriggerType;
  agencyId: string;
  subAccountId: string;
  contactId: string;
  occurredAt?: string;
  source: string;
  correlationId?: string | null;
  deduplicationKey?: string | null;
  payload?: T;
}

export function emitWorkflowEvent(event: WorkflowEvent): void {
  void import("./engine").then(({ fireWorkflowTrigger }) =>
    fireWorkflowTrigger({
      agencyId: event.agencyId,
      subAccountId: event.subAccountId,
      type: event.eventType,
      contactId: event.contactId,
      context: {
        eventId: event.eventId ?? null,
        eventType: event.eventType,
        occurredAt: event.occurredAt ?? new Date().toISOString(),
        source: event.source,
        correlationId: event.correlationId ?? null,
        deduplicationKey: event.deduplicationKey ?? event.eventId ?? null,
        ...(event.payload ?? {}),
      },
    })
  );
}
