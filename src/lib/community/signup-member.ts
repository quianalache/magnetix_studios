import "server-only";

import {
  ensureMember,
  ExistingMemberRequiresSignInError,
  findMemberByEmail,
} from "@/lib/community/member-account";
import { signMemberSessionToken } from "@/lib/community/member-auth";
import {
  getCurrentMember,
  setMemberSessionCookie,
} from "@/lib/community/member-session";
import {
  sendMemberSignupSignInLink,
  signInRequiredResponseBody,
} from "@/lib/community/signup-sign-in-link";
import type { Member } from "@/types/community";
import type { ContactAttribution } from "@/types/contacts";

export type SignupMemberResult =
  | { kind: "member"; member: Member }
  | {
      kind: "sign-in-required";
      body: ReturnType<typeof signInRequiredResponseBody>;
    };

/**
 * Sign-up security (2026-10-19) — the single Member resolver for the
 * instant Offer and course sign-up forms.
 *
 *  - Brand-new email: create the Member (marked unverified) and sign the
 *    browser in, exactly as before, so a first purchase stays instant.
 *  - Email that already has a Member, and this browser is already signed
 *    in as that Member: continue (fills blank fields only, never
 *    overwrites).
 *  - Email that already has a Member, any other case: sign NOBODY in and
 *    change nothing. The account owner is emailed a sign-in link that
 *    returns to `returnPath`, where checkout continues.
 */
export async function resolveSignupMember({
  subAccountId,
  email,
  displayName,
  phone,
  address,
  attribution,
  returnPath,
}: {
  subAccountId: string;
  email: string;
  displayName: string;
  phone?: string | null;
  address?: string | null;
  attribution?: ContactAttribution | null;
  returnPath: string;
}): Promise<SignupMemberResult> {
  const signInRequired = async (): Promise<SignupMemberResult> => {
    await sendMemberSignupSignInLink({ subAccountId, email, returnPath });
    return { kind: "sign-in-required", body: signInRequiredResponseBody(email) };
  };

  const existing = await findMemberByEmail(subAccountId, email);
  if (existing) {
    const current = await getCurrentMember(subAccountId);
    if (!current || current.id !== existing.id) return signInRequired();
    const member = await ensureMember({
      subAccountId,
      email,
      displayName,
      phone,
      address,
      source: "course",
      attribution,
    });
    return { kind: "member", member };
  }

  let member: Member;
  try {
    member = await ensureMember({
      subAccountId,
      email,
      displayName,
      phone,
      address,
      source: "course",
      attribution,
      emailProof: "unverified-signup",
    });
  } catch (err) {
    // Lost a race with another sign-up for the same email.
    if (err instanceof ExistingMemberRequiresSignInError) return signInRequired();
    throw err;
  }
  await setMemberSessionCookie(
    signMemberSessionToken(subAccountId, member.id, member.email)
  );
  return { kind: "member", member };
}
