export type ClassroomCourseOption = {
  id: string;
  title: string;
  published: boolean;
};

/** The only course pool a Community Membership Level may reference. */
export function mergeClassroomCoursePool(
  native: readonly ClassroomCourseOption[],
  linkedStandalone: readonly ClassroomCourseOption[],
): ClassroomCourseOption[] {
  const byId = new Map<string, ClassroomCourseOption>();
  for (const course of [...native, ...linkedStandalone]) byId.set(course.id, course);
  return [...byId.values()].sort((a, b) => a.title.localeCompare(b.title));
}
