import "server-only";

import {
  createUnverifiedPerson,
  findPersonIdByEmail,
} from "@/lib/server/person-identity-service";
import { signPersonSessionToken } from "@/lib/server/person-auth";
import { getCurrentPerson, setPersonSessionCookie } from "@/lib/server/person-session";
import {
  sendPersonSignupSignInLink,
  signInRequiredResponseBody,
} from "@/lib/community/signup-sign-in-link";

export type SignupPersonResult =
  | { kind: "person"; personId: string }
  | {
      kind: "sign-in-required";
      body: ReturnType<typeof signInRequiredResponseBody>;
    };

/**
 * Sign-up security (2026-10-19) — the agency-Offer/agency-course twin of
 * `resolveSignupMember`, for the global MyMagnetix person. A person spans
 * every business, so an existing one is only ever continued by a browser
 * already signed in as it; otherwise nobody is signed in and the owner is
 * emailed a MyMagnetix sign-in link back to `next`. A brand-new email
 * creates an unverified person and signs in as before.
 */
export async function resolveSignupPerson({
  email,
  origin,
  next,
}: {
  email: string;
  origin: string;
  next: string;
}): Promise<SignupPersonResult> {
  const existingId = await findPersonIdByEmail(email);
  if (existingId) {
    const current = await getCurrentPerson();
    if (current?.id === existingId) return { kind: "person", personId: existingId };
    await sendPersonSignupSignInLink({ email, origin, next });
    return { kind: "sign-in-required", body: signInRequiredResponseBody(email) };
  }
  const personId = await createUnverifiedPerson(email);
  await setPersonSessionCookie(signPersonSessionToken(personId, email));
  return { kind: "person", personId };
}
