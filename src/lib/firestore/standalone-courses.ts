import {
  collection,
  doc,
  onSnapshot,
  query,
  orderBy,
  type Unsubscribe,
} from "firebase/firestore";
import { getFirebaseDb } from "@/lib/firebase/client";
import type {
  StandaloneCourse,
  StandaloneCourseSection,
  StandaloneLesson,
  StandaloneCoursePurchase,
} from "@/types/standalone-courses";

/**
 * Client-side subscriptions for the STAFF standalone-course dashboard (staff
 * are Firebase users; rules allow staff-scoped reads of
 * standaloneCourses/**). All writes go through the Admin-SDK routes. Buyers
 * never use these — their sales page + player are server-rendered.
 * Mirrors `src/lib/firestore/community-classroom.ts`.
 */

function coursesPath(saId: string) {
  return `subAccounts/${saId}/standaloneCourses`;
}

export function subscribeToStandaloneCourses(
  saId: string,
  cb: (courses: StandaloneCourse[]) => void,
  onError?: (e: Error) => void,
): Unsubscribe {
  return onSnapshot(
    collection(getFirebaseDb(), coursesPath(saId)),
    (snap) => {
      cb(
        snap.docs.map(
          (d) => ({ id: d.id, ...(d.data() as Omit<StandaloneCourse, "id">) }),
        ),
      );
    },
    (e) => onError?.(e),
  );
}

export function subscribeToStandaloneCourse(
  saId: string,
  courseId: string,
  cb: (course: StandaloneCourse | null) => void,
  onError?: (e: Error) => void,
): Unsubscribe {
  return onSnapshot(
    doc(getFirebaseDb(), `${coursesPath(saId)}/${courseId}`),
    (snap) => {
      cb(
        snap.exists()
          ? { id: snap.id, ...(snap.data() as Omit<StandaloneCourse, "id">) }
          : null,
      );
    },
    (e) => onError?.(e),
  );
}

export function subscribeToStandaloneSections(
  saId: string,
  courseId: string,
  cb: (sections: StandaloneCourseSection[]) => void,
  onError?: (e: Error) => void,
): Unsubscribe {
  return onSnapshot(
    query(
      collection(getFirebaseDb(), `${coursesPath(saId)}/${courseId}/sections`),
      orderBy("order", "asc"),
    ),
    (snap) => {
      cb(
        snap.docs.map(
          (d) => ({ id: d.id, ...(d.data() as Omit<StandaloneCourseSection, "id">) }),
        ),
      );
    },
    (e) => onError?.(e),
  );
}

export function subscribeToStandaloneLessons(
  saId: string,
  courseId: string,
  cb: (lessons: StandaloneLesson[]) => void,
  onError?: (e: Error) => void,
): Unsubscribe {
  return onSnapshot(
    query(
      collection(getFirebaseDb(), `${coursesPath(saId)}/${courseId}/lessons`),
      orderBy("order", "asc"),
    ),
    (snap) => {
      cb(
        snap.docs.map(
          (d) => ({ id: d.id, ...(d.data() as Omit<StandaloneLesson, "id">) }),
        ),
      );
    },
    (e) => onError?.(e),
  );
}

export function subscribeToStandalonePurchases(
  saId: string,
  courseId: string,
  cb: (purchases: StandaloneCoursePurchase[]) => void,
  onError?: (e: Error) => void,
): Unsubscribe {
  return onSnapshot(
    collection(getFirebaseDb(), `${coursesPath(saId)}/${courseId}/purchases`),
    (snap) =>
      cb(
        snap.docs.map(
          (d) => ({ id: d.id, ...(d.data() as Omit<StandaloneCoursePurchase, "id">) }),
        ),
      ),
    (e) => onError?.(e),
  );
}
