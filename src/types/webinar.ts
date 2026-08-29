import type { FieldValue, Timestamp } from "firebase/firestore";

export type WebinarType = "live" | "evergreen" | "hybrid";
export type WebinarStatus =
  | "draft"
  | "scheduled"
  | "live"
  | "ended"
  | "canceled";
export type WebinarRegistrantStatus = "registered" | "canceled";
export type WebinarAttendanceStatus =
  | "not_joined"
  | "joined"
  | "attended"
  | "left";

export interface Webinar {
  id: string;
  agencyId: string;
  subAccountId: string;
  slug: string;
  title: string;
  description: string;
  webinarType: WebinarType;
  status: WebinarStatus;
  startAt: Timestamp | FieldValue | null;
  endAt: Timestamp | FieldValue | null;
  timezone: string;
  liveSessionId: string | null;
  hostUid: string | null;
  createdAt: Timestamp | FieldValue | null;
  updatedAt: Timestamp | FieldValue | null;
  replayMediaAssetId?: string | null;
  registrationPageId?: string | null;
  confirmationPageId?: string | null;
  offerId?: string | null;
  recordingStatus?: "disabled" | "pending" | "ready" | "failed";
  evergreenConfig?: Record<string, unknown> | null;
}

export interface WebinarRegistrant {
  id: string;
  webinarId: string;
  subAccountId: string;
  firstName: string;
  lastName: string;
  email: string;
  contactId: string | null;
  personId: string | null;
  status: WebinarRegistrantStatus;
  attendance: WebinarAttendanceStatus;
  firstJoinedAt: Timestamp | FieldValue | null;
  lastLeftAt: Timestamp | FieldValue | null;
  totalWatchSeconds: number;
  createdAt: Timestamp | FieldValue | null;
  updatedAt: Timestamp | FieldValue | null;
}
