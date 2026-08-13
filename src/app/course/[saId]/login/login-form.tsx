import { MemberLoginForm as SharedMemberLoginForm } from "@/components/member-auth/member-login-form";

export function CourseLoginForm({
  saId,
  course,
}: {
  saId: string;
  course?: string;
}) {
  return (
    <SharedMemberLoginForm
      saId={saId}
      endpoint={`/api/course/${saId}/login`}
      extraBody={{ course }}
      resetNext={course ? `/course/${saId}/${course}` : `/course/${saId}/login`}
    />
  );
}
