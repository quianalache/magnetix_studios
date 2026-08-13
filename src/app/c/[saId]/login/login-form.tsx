import { MemberLoginForm as SharedMemberLoginForm } from "@/components/member-auth/member-login-form";

export function MemberLoginForm({
  saId,
  join,
}: {
  saId: string;
  join?: string;
}) {
  return (
    <SharedMemberLoginForm
      saId={saId}
      endpoint={`/api/community/${saId}/login`}
      extraBody={{ join }}
      resetNext={`/c/${saId}`}
    />
  );
}
