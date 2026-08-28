import "server-only";

import { getAdminAuth } from "@/lib/firebase/admin";

export interface LiveParticipantIdentity {
  stableIdentity: string;
  displayName: string;
  email: string;
}

export async function resolveLiveParticipantIdentityServerSide(input: {
  uid: string;
  email?: string;
  displayName?: string;
  sessionId: string;
}): Promise<LiveParticipantIdentity> {
  let user: { email?: string | null; displayName?: string | null } = {};
  try {
    user = await getAdminAuth().getUser(input.uid);
  } catch {
    // Community members use the signed member identity, not Firebase Auth.
  }
  const email = user.email || input.email || "";
  const fullName = input.displayName?.trim() || user.displayName?.trim() || "";
  const firstName = fullName.split(/\s+/)[0] || "";
  const displayName =
    firstName || fullName || email || `Participant ${input.uid.slice(0, 6)}`;
  return {
    stableIdentity: `${input.uid}:${input.sessionId}`,
    displayName,
    email,
  };
}
