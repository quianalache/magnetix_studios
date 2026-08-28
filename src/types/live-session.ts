import type { FieldValue, Timestamp } from "firebase/firestore";

export type LiveSessionSourceType =
  | "appointment"
  | "community"
  | "course"
  | "webinar"
  | "standalone"
  | "internal";
export type LiveSessionMode = "meeting" | "broadcast";
export type LiveSessionStatus = "scheduled" | "live" | "ended" | "canceled";
export type LiveSessionProvider = "livekit";
export type LiveSessionRole =
  | "HOST"
  | "CO_HOST"
  | "PRESENTER"
  | "SPEAKER"
  | "ATTENDEE"
  | "VIEWER";

export interface LiveSessionSettings {
  recordingEnabled: boolean;
  maxParticipants: number | null;
}

export interface LiveSession {
  id: string;
  agencyId: string | null;
  subAccountId: string | null;
  sourceType: LiveSessionSourceType;
  sourceId: string | null;
  title: string;
  description: string | null;
  mode: LiveSessionMode;
  status: LiveSessionStatus;
  scheduledStartAt: Timestamp | FieldValue | null;
  scheduledEndAt: Timestamp | FieldValue | null;
  actualStartedAt: Timestamp | FieldValue | null;
  actualEndedAt: Timestamp | FieldValue | null;
  provider: LiveSessionProvider;
  providerRoomName: string;
  hostPersonId: string | null;
  settings: LiveSessionSettings;
  recordingStatus: "disabled" | "pending" | "ready" | "failed";
  providerEgressId: string | null;
  replayAssetId: string | null;
  createdAt: Timestamp | FieldValue | null;
  updatedAt: Timestamp | FieldValue | null;
}
