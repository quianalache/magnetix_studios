import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  where,
  type Unsubscribe,
} from "firebase/firestore";
import { getFirebaseDb } from "@/lib/firebase/client";
import type { Project, ProjectStep, ProjectTemplate } from "@/types/projects";
import type { TenantScope } from "@/types";

/**
 * Client-side LIVE READS only — every mutation (create/update/delete on a
 * project, step, or template) goes through the API routes in
 * `/api/sub-accounts/[id]/projects*`, which call `project-service.ts`
 * server-side. Firestore rules for these collections are read-only for staff
 * (see firestore.rules) precisely so a project can also be edited from the
 * Client Portal side, where the member has no Firebase Auth identity for
 * rules to check at all. Subscribing here still gives staff a fully live
 * view — onSnapshot fires on any write to the collection regardless of
 * whether it came from the CRM or a member's portal action.
 */

const PROJECTS = "projects";
const TEMPLATES = "projectTemplates";

export function subscribeToProjects(
  scope: TenantScope,
  callback: (projects: Project[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  const q = query(
    collection(getFirebaseDb(), PROJECTS),
    where("subAccountId", "==", scope.subAccountId),
  );
  return onSnapshot(
    q,
    (snap) => {
      const projects = snap.docs.map(
        (d) => ({ id: d.id, ...(d.data() as Omit<Project, "id">) }),
      );
      projects.sort((a, b) => toMillis(b.createdAt) - toMillis(a.createdAt));
      callback(projects);
    },
    (err) => onError?.(err),
  );
}

export function subscribeToProject(
  projectId: string,
  callback: (project: Project | null) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  return onSnapshot(
    doc(getFirebaseDb(), PROJECTS, projectId),
    (snap) => {
      callback(snap.exists() ? { id: snap.id, ...(snap.data() as Omit<Project, "id">) } : null);
    },
    (err) => onError?.(err),
  );
}

export function subscribeToProjectSteps(
  projectId: string,
  callback: (steps: ProjectStep[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  const q = query(
    collection(getFirebaseDb(), PROJECTS, projectId, "steps"),
    orderBy("order", "asc"),
  );
  return onSnapshot(
    q,
    (snap) => {
      callback(
        snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ProjectStep, "id">) })),
      );
    },
    (err) => onError?.(err),
  );
}

export function subscribeToProjectTemplates(
  scope: TenantScope,
  callback: (templates: ProjectTemplate[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  const q = query(
    collection(getFirebaseDb(), TEMPLATES),
    where("subAccountId", "==", scope.subAccountId),
  );
  return onSnapshot(
    q,
    (snap) => {
      const templates = snap.docs.map(
        (d) => ({ id: d.id, ...(d.data() as Omit<ProjectTemplate, "id">) }),
      );
      templates.sort((a, b) => a.title.localeCompare(b.title));
      callback(templates);
    },
    (err) => onError?.(err),
  );
}

// Reserved for a future "which projects touch this contact" panel on the
// Contact profile page — not wired up yet, but the collection is already
// query-able this way without a new index (subAccountId + assignedContactId
// is the same compound shape `listProjectsForContact` uses server-side).
export function subscribeToProjectsForContact(
  scope: TenantScope,
  contactId: string,
  callback: (projects: Project[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  const q = query(
    collection(getFirebaseDb(), PROJECTS),
    where("subAccountId", "==", scope.subAccountId),
    where("assignedContactId", "==", contactId),
  );
  return onSnapshot(
    q,
    (snap) => {
      callback(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Project, "id">) })));
    },
    (err) => onError?.(err),
  );
}

function toMillis(v: unknown): number {
  if (!v) return 0;
  const maybe = v as { toDate?: () => Date; seconds?: number };
  if (typeof maybe.toDate === "function") return maybe.toDate().getTime();
  if (typeof maybe.seconds === "number") return maybe.seconds * 1000;
  return 0;
}
