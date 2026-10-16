import { MemberLoginForm as SharedMemberLoginForm } from "@/components/member-auth/member-login-form";

export function MemberLoginForm({
  saId,
  join,
  inviteRef,
  next,
  accentColor,
}: {
  saId: string;
  /** The joining community's own brand color (when the link names one). */
  accentColor?: string | null;
  join?: string;
  /** Points & Rewards — the inviting member's memberId from `?ref=` on the
   *  login URL. See `communityLoginHref`'s doc comment. */
  inviteRef?: string;
  next?: string;
}) {
  return (
    <SharedMemberLoginForm
      saId={saId}
      endpoint={`/api/community/${saId}/login`}
      extraBody={{ join, ref: inviteRef, next }}
      resetNext={`/c/${saId}`}
      accentColor={accentColor ?? undefined}
    />
  );
}
