import { MemberLoginForm as SharedMemberLoginForm } from "@/components/member-auth/member-login-form";

export function MemberLoginForm({
  saId,
  join,
  inviteRef,
}: {
  saId: string;
  join?: string;
  /** Points & Rewards — the inviting member's memberId from `?ref=` on the
   *  login URL. See `communityLoginHref`'s doc comment. */
  inviteRef?: string;
}) {
  return (
    <SharedMemberLoginForm
      saId={saId}
      endpoint={`/api/community/${saId}/login`}
      extraBody={{ join, ref: inviteRef }}
      resetNext={`/c/${saId}`}
    />
  );
}
