import { MemberLoginForm as SharedMemberLoginForm } from "@/components/member-auth/member-login-form";

export function PortalLoginForm({
  saId,
  accentColor,
}: {
  saId: string;
  accentColor?: string;
}) {
  return (
    <SharedMemberLoginForm
      saId={saId}
      endpoint={`/api/portal/${saId}/login`}
      accentColor={accentColor}
      compact
      resetNext={`/portal/${saId}`}
    />
  );
}
