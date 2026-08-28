import "server-only";

import type { LiveSession, LiveSessionRole } from "@/types/live-session";
import {
  getLiveSessionServerSide,
  rolePermissions,
} from "@/lib/server/live-session-service";
import {
  resolveLiveParticipantIdentityServerSide,
  type LiveParticipantIdentity,
} from "@/lib/server/live-session-identity-service";

export interface LiveSessionAccess {
  session: LiveSession;
  identity: LiveParticipantIdentity;
  role: LiveSessionRole;
  permissions: ReturnType<typeof rolePermissions>;
}

export async function resolveInternalLiveSessionAccess(input: {
  sessionId: string;
  uid: string;
  email: string;
  requestedRole: "host" | "attendee";
  isAdmin: boolean;
}): Promise<LiveSessionAccess> {
  const session = await getLiveSessionServerSide(input.sessionId);
  if (!session || session.sourceType !== "internal")
    throw new Error("LiveSession not found.");
  const role: LiveSessionRole =
    input.requestedRole === "host" && input.isAdmin ? "HOST" : "ATTENDEE";
  const identity = await resolveLiveParticipantIdentityServerSide({
    uid: input.uid,
    email: input.email,
    sessionId: session.id,
  });
  return { session, identity, role, permissions: rolePermissions(role) };
}
