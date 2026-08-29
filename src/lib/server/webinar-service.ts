import "server-only";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import {
  createContactServerSide,
  findExistingContactId,
} from "@/lib/server/contacts-service";
import {
  createLiveSessionServerSide,
  getLiveSessionServerSide,
  updateLiveSessionLifecycleServerSide,
} from "@/lib/server/live-session-service";
import type {
  Webinar,
  WebinarRegistrant,
  WebinarStatus,
} from "@/types/webinar";

function webinars(subAccountId: string) {
  return getAdminDb().collection(`subAccounts/${subAccountId}/webinars`);
}
function registrants(subAccountId: string, webinarId: string) {
  return webinars(subAccountId).doc(webinarId).collection("registrants");
}
function fromDoc<T>(id: string, data: FirebaseFirestore.DocumentData) {
  return { id, ...data } as T;
}
function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

export async function getWebinarServerSide(
  subAccountId: string,
  webinarId: string
) {
  const snap = await webinars(subAccountId).doc(webinarId).get();
  return snap.exists ? fromDoc<Webinar>(snap.id, snap.data() ?? {}) : null;
}
export async function getWebinarBySlugServerSide(
  subAccountId: string,
  slug: string
) {
  const snap = await webinars(subAccountId)
    .where("slug", "==", slug)
    .limit(1)
    .get();
  return snap.empty
    ? null
    : fromDoc<Webinar>(snap.docs[0].id, snap.docs[0].data());
}
export async function listWebinarsServerSide(subAccountId: string) {
  const snap = await webinars(subAccountId).limit(100).get();
  return snap.docs
    .map((d) => fromDoc<Webinar>(d.id, d.data()))
    .sort((a, b) => millis(b.startAt) - millis(a.startAt));
}
function millis(value: unknown) {
  const v = value as { toMillis?: () => number; seconds?: number } | null;
  return typeof v?.toMillis === "function"
    ? v.toMillis()
    : (v?.seconds ?? 0) * 1000;
}

export async function createWebinarServerSide(input: {
  agencyId: string;
  subAccountId: string;
  hostUid: string;
  title: string;
  description?: string;
  startAt: Date;
  endAt: Date;
  timezone: string;
  webinarType?: Webinar["webinarType"];
}) {
  const ref = webinars(input.subAccountId).doc();
  const baseSlug = slugify(input.title) || ref.id;
  const slugSnap = await webinars(input.subAccountId)
    .where("slug", "==", baseSlug)
    .limit(1)
    .get();
  const slug = slugSnap.empty ? baseSlug : `${baseSlug}-${ref.id.slice(0, 6)}`;
  const session = await createLiveSessionServerSide({
    agencyId: input.agencyId,
    subAccountId: input.subAccountId,
    sourceType: "webinar",
    sourceId: ref.id,
    title: input.title,
    description: input.description,
    mode: "broadcast",
    status: "scheduled",
    scheduledStartAt: input.startAt,
    scheduledEndAt: input.endAt,
  });
  const data = {
    agencyId: input.agencyId,
    subAccountId: input.subAccountId,
    slug,
    title: input.title.trim().slice(0, 200),
    description: input.description?.trim().slice(0, 4000) ?? "",
    webinarType: input.webinarType ?? "live",
    status: "scheduled" as const,
    startAt: input.startAt,
    endAt: input.endAt,
    timezone: input.timezone,
    liveSessionId: session.id,
    hostUid: input.hostUid,
    replayMediaAssetId: null,
    registrationPageId: null,
    confirmationPageId: null,
    offerId: null,
    recordingStatus: "disabled" as const,
    evergreenConfig: null,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };
  await ref.create(data);
  return fromDoc<Webinar>(ref.id, data);
}

export async function updateWebinarLifecycleServerSide(
  subAccountId: string,
  webinarId: string,
  status: WebinarStatus
) {
  const webinar = await getWebinarServerSide(subAccountId, webinarId);
  if (!webinar) return null;
  if (webinar.liveSessionId)
    await updateLiveSessionLifecycleServerSide(
      webinar.liveSessionId,
      status === "canceled"
        ? "canceled"
        : status === "ended"
          ? "ended"
          : status === "live"
            ? "live"
            : "scheduled"
    );
  await webinars(subAccountId)
    .doc(webinarId)
    .update({ status, updatedAt: FieldValue.serverTimestamp() });
  return getWebinarServerSide(subAccountId, webinarId);
}

export async function getWebinarSessionServerSide(
  subAccountId: string,
  webinarId: string
) {
  const webinar = await getWebinarServerSide(subAccountId, webinarId);
  if (!webinar?.liveSessionId) return null;
  const session = await getLiveSessionServerSide(webinar.liveSessionId);
  return session?.subAccountId === subAccountId &&
    session.sourceId === webinarId
    ? { webinar, session }
    : null;
}

export async function registerForWebinarServerSide(input: {
  subAccountId: string;
  agencyId: string;
  webinarId: string;
  firstName: string;
  lastName: string;
  email: string;
}) {
  const email = input.email.trim().toLowerCase();
  const webinar = await getWebinarServerSide(
    input.subAccountId,
    input.webinarId
  );
  if (!webinar || webinar.status === "canceled" || webinar.status === "ended")
    throw new Error("Webinar registration is closed.");
  const existing = await registrants(input.subAccountId, input.webinarId)
    .where("email", "==", email)
    .limit(1)
    .get();
  if (!existing.empty)
    return fromDoc<WebinarRegistrant>(
      existing.docs[0].id,
      existing.docs[0].data()
    );
  let contactId = await findExistingContactId(
    getAdminDb(),
    input.subAccountId,
    { email }
  );
  if (!contactId)
    contactId = (
      await createContactServerSide({
        subAccountId: input.subAccountId,
        agencyId: input.agencyId,
        createdByUid: "webinar-registration",
        mode: "live",
        name: `${input.firstName.trim()} ${input.lastName.trim()}`.trim(),
        email,
        phone: "",
        company: "",
        address: "",
        source: "community",
        tags: ["webinar"],
      })
    ).id;
  const ref = registrants(input.subAccountId, input.webinarId).doc();
  const data = {
    webinarId: input.webinarId,
    subAccountId: input.subAccountId,
    firstName: input.firstName.trim().slice(0, 80),
    lastName: input.lastName.trim().slice(0, 80),
    email,
    contactId,
    personId: null,
    status: "registered" as const,
    attendance: "not_joined" as const,
    firstJoinedAt: null,
    lastLeftAt: null,
    totalWatchSeconds: 0,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  };
  await ref.create(data);
  return fromDoc<WebinarRegistrant>(ref.id, data);
}
export async function listWebinarRegistrantsServerSide(
  subAccountId: string,
  webinarId: string
) {
  const snap = await registrants(subAccountId, webinarId).limit(500).get();
  return snap.docs.map((d) => fromDoc<WebinarRegistrant>(d.id, d.data()));
}
export async function getWebinarRegistrantServerSide(
  subAccountId: string,
  webinarId: string,
  registrantId: string
) {
  const snap = await registrants(subAccountId, webinarId)
    .doc(registrantId)
    .get();
  return snap.exists
    ? fromDoc<WebinarRegistrant>(snap.id, snap.data() ?? {})
    : null;
}
export async function markWebinarJoinedServerSide(
  subAccountId: string,
  webinarId: string,
  registrantId: string
) {
  await registrants(subAccountId, webinarId).doc(registrantId).update({
    attendance: "joined",
    firstJoinedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
}
