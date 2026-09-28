import "server-only";

import { getAdminDb } from "@/lib/firebase/admin";

/**
 * Where a task document lives. Ordinary CRM tasks are `tasks/{id}`.
 * Routine activities (ids `rt_{routineId}_{YYYYMMDD}_{activityId}`) are
 * `routineTasks/{id}` — a server-only collection (no firestore.rules match,
 * default deny) so a PERSONAL routine's activities can't be read by other
 * members through the browser's `tasks` queries. Same document shape; the
 * shared Tasks services reach either through this one resolver.
 */
export const ROUTINE_TASKS_COLLECTION = "routineTasks";

export function isRoutineTaskId(id: unknown): id is string {
  return typeof id === "string" && id.startsWith("rt_");
}

export function taskDocRef(id: string): FirebaseFirestore.DocumentReference {
  return getAdminDb().doc(`${isRoutineTaskId(id) ? ROUTINE_TASKS_COLLECTION : "tasks"}/${id}`);
}
