import "server-only";

import { createHash } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import type {
  ExternalBillingCustomer,
  ExternalBillingCustomerStatus,
  ExternalBillingMetadata,
  ExternalBillingProvider,
  ExternalBillingSource,
  ExternalSubscription,
  ExternalSubscriptionStatus,
} from "@/types/external-billing";

const CUSTOMER_COLLECTION = "externalBillingCustomers";
const SUBSCRIPTION_COLLECTION = "externalSubscriptions";

export type UpsertExternalBillingCustomerInput = Omit<
  ExternalBillingCustomer,
  "id" | "createdAt" | "updatedAt" | "normalizedEmail"
> & { normalizedEmail?: string };

export type UpsertExternalSubscriptionInput = Omit<
  ExternalSubscription,
  "id" | "createdAt" | "updatedAt"
>;

function cleanRequired(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${field} is required.`);
  }
  return value.trim();
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function normalizeCurrency(currency: string | null): string | null {
  if (currency == null) return null;
  const value = currency.trim().toLowerCase();
  return value || null;
}

function normalizeStatus(value: unknown): ExternalSubscriptionStatus {
  switch (value) {
    case "active":
    case "trialing":
    case "past_due":
    case "paused":
    case "canceled":
    case "ended":
    case "incomplete":
      return value;
    default:
      return "unknown";
  }
}

function normalizeCustomerStatus(
  value: unknown
): ExternalBillingCustomerStatus {
  return value === "active" || value === "archived" ? value : "unknown";
}

function normalizeNonNegativeInteger(
  value: number | null,
  field: string
): number | null {
  if (value == null) return null;
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${field} must be a non-negative integer or null.`);
  }
  return value;
}

function normalizePositiveInteger(
  value: number | null,
  field: string
): number | null {
  if (value == null) return null;
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${field} must be a positive integer or null.`);
  }
  return value;
}

function keyId(
  collection: string,
  agencyId: string,
  subAccountId: string,
  provider: string,
  providerAccountId: string,
  externalId: string
): string {
  const identity = [
    collection,
    agencyId,
    subAccountId,
    provider,
    providerAccountId,
    externalId,
  ].join("\u001f");
  return `${collection === CUSTOMER_COLLECTION ? "customer" : "subscription"}_${createHash("sha256").update(identity).digest("hex")}`;
}

async function assertSubAccountTenant(
  agencyId: string,
  subAccountId: string
): Promise<void> {
  const snap = await getAdminDb().doc(`subAccounts/${subAccountId}`).get();
  if (!snap.exists || snap.data()?.agencyId !== agencyId) {
    throw new Error("Sub-account does not belong to the supplied agency.");
  }
}

async function getSubAccountAgencyId(
  subAccountId: string
): Promise<string | null> {
  const snap = await getAdminDb().doc(`subAccounts/${subAccountId}`).get();
  const agencyId = snap.data()?.agencyId;
  return snap.exists && typeof agencyId === "string" && agencyId.trim()
    ? agencyId
    : null;
}

async function assertContactTenant(
  subAccountId: string,
  contactId: string
): Promise<void> {
  const snap = await getAdminDb().doc(`contacts/${contactId}`).get();
  const data = snap.data();
  if (!snap.exists || data?.subAccountId !== subAccountId) {
    throw new Error("Contact does not belong to the supplied sub-account.");
  }
}

async function assertMemberTenant(
  subAccountId: string,
  memberId: string | null
): Promise<void> {
  if (!memberId) return;
  const snap = await getAdminDb()
    .doc(`subAccounts/${subAccountId}/members/${memberId}`)
    .get();
  if (!snap.exists) {
    throw new Error("Member does not belong to the supplied sub-account.");
  }
}

function assertImmutableIdentity(
  existing: FirebaseFirestore.DocumentData,
  input: {
    agencyId: string;
    subAccountId: string;
    provider: string;
    providerAccountId: string;
    externalId: string;
    externalIdField: "externalCustomerId" | "externalSubscriptionId";
  }
): void {
  const checks: Array<[string, unknown, unknown]> = [
    ["agencyId", existing.agencyId, input.agencyId],
    ["subAccountId", existing.subAccountId, input.subAccountId],
    ["provider", existing.provider, input.provider],
    ["providerAccountId", existing.providerAccountId, input.providerAccountId],
    [input.externalIdField, existing[input.externalIdField], input.externalId],
  ];
  for (const [field, current, incoming] of checks) {
    if (current !== incoming) {
      throw new Error(
        `Cannot change immutable external billing identity field: ${field}.`
      );
    }
  }
}

function serialize<T extends ExternalBillingCustomer | ExternalSubscription>(
  id: string,
  data: FirebaseFirestore.DocumentData
): T {
  return { id, ...data } as T;
}

export async function getExternalBillingCustomerById(
  subAccountId: string,
  id: string
): Promise<ExternalBillingCustomer | null> {
  cleanRequired(subAccountId, "subAccountId");
  cleanRequired(id, "id");
  const snap = await getAdminDb().doc(`${CUSTOMER_COLLECTION}/${id}`).get();
  if (!snap.exists || snap.data()?.subAccountId !== subAccountId) return null;
  return serialize<ExternalBillingCustomer>(snap.id, snap.data()!);
}

export async function findExternalBillingCustomerByProviderCustomer(input: {
  subAccountId: string;
  provider: ExternalBillingProvider;
  providerAccountId: string;
  externalCustomerId: string;
}): Promise<ExternalBillingCustomer | null> {
  const subAccountId = cleanRequired(input.subAccountId, "subAccountId");
  const provider = cleanRequired(input.provider, "provider");
  const providerAccountId = cleanRequired(
    input.providerAccountId,
    "providerAccountId"
  );
  const externalCustomerId = cleanRequired(
    input.externalCustomerId,
    "externalCustomerId"
  );
  const agencyId = await getSubAccountAgencyId(subAccountId);
  if (!agencyId) return null;
  const id = keyId(
    CUSTOMER_COLLECTION,
    agencyId,
    subAccountId,
    provider,
    providerAccountId,
    externalCustomerId
  );
  const snap = await getAdminDb().doc(`${CUSTOMER_COLLECTION}/${id}`).get();
  if (!snap.exists || snap.data()?.subAccountId !== subAccountId) return null;
  return serialize<ExternalBillingCustomer>(snap.id, snap.data()!);
}

export async function listExternalBillingCustomersForContact(
  subAccountId: string,
  contactId: string
): Promise<ExternalBillingCustomer[]> {
  cleanRequired(subAccountId, "subAccountId");
  cleanRequired(contactId, "contactId");
  const snap = await getAdminDb()
    .collection(CUSTOMER_COLLECTION)
    .where("subAccountId", "==", subAccountId)
    .where("contactId", "==", contactId)
    .get();
  return snap.docs.map((doc) =>
    serialize<ExternalBillingCustomer>(doc.id, doc.data())
  );
}

export async function listExternalBillingCustomersForEmail(
  subAccountId: string,
  email: string
): Promise<ExternalBillingCustomer[]> {
  cleanRequired(subAccountId, "subAccountId");
  const normalizedEmail = normalizeEmail(cleanRequired(email, "email"));
  const snap = await getAdminDb()
    .collection(CUSTOMER_COLLECTION)
    .where("subAccountId", "==", subAccountId)
    .where("normalizedEmail", "==", normalizedEmail)
    .get();
  return snap.docs.map((doc) =>
    serialize<ExternalBillingCustomer>(doc.id, doc.data())
  );
}

export async function upsertExternalBillingCustomer(
  input: UpsertExternalBillingCustomerInput
): Promise<ExternalBillingCustomer> {
  const agencyId = cleanRequired(input.agencyId, "agencyId");
  const subAccountId = cleanRequired(input.subAccountId, "subAccountId");
  const provider = cleanRequired(input.provider, "provider");
  const providerAccountId = cleanRequired(
    input.providerAccountId,
    "providerAccountId"
  );
  const externalCustomerId = cleanRequired(
    input.externalCustomerId,
    "externalCustomerId"
  );
  const contactId = cleanRequired(input.contactId, "contactId");
  const email = cleanRequired(input.email, "email");
  await assertSubAccountTenant(agencyId, subAccountId);
  await assertContactTenant(subAccountId, contactId);
  await assertMemberTenant(subAccountId, input.memberId);

  const id = keyId(
    CUSTOMER_COLLECTION,
    agencyId,
    subAccountId,
    provider,
    providerAccountId,
    externalCustomerId
  );
  const ref = getAdminDb().doc(`${CUSTOMER_COLLECTION}/${id}`);
  const now = FieldValue.serverTimestamp();
  const existing = await ref.get();
  if (existing.exists) {
    assertImmutableIdentity(existing.data()!, {
      agencyId,
      subAccountId,
      provider,
      providerAccountId,
      externalId: externalCustomerId,
      externalIdField: "externalCustomerId",
    });
  }

  const data = {
    agencyId,
    subAccountId,
    provider,
    providerAccountId,
    providerEnvironment: input.providerEnvironment ?? null,
    externalCustomerId,
    contactId,
    personId: input.personId ?? null,
    memberId: input.memberId ?? null,
    email: email.trim(),
    normalizedEmail: normalizeEmail(email),
    name: input.name?.trim() || null,
    status: normalizeCustomerStatus(input.status ?? "active"),
    source: (input.source ?? "imported") as ExternalBillingSource,
    importedAt: input.importedAt ?? null,
    importedByUid: input.importedByUid ?? null,
    ...(existing.exists ? {} : { createdAt: now }),
    updatedAt: now,
  };
  await ref.set(data, { merge: true });
  const saved = await ref.get();
  return serialize<ExternalBillingCustomer>(ref.id, saved.data()!);
}

export async function getExternalSubscriptionById(
  subAccountId: string,
  id: string
): Promise<ExternalSubscription | null> {
  cleanRequired(subAccountId, "subAccountId");
  cleanRequired(id, "id");
  const snap = await getAdminDb().doc(`${SUBSCRIPTION_COLLECTION}/${id}`).get();
  if (!snap.exists || snap.data()?.subAccountId !== subAccountId) return null;
  return serialize<ExternalSubscription>(snap.id, snap.data()!);
}

export async function findExternalSubscriptionByProviderSubscription(input: {
  subAccountId: string;
  provider: ExternalBillingProvider;
  providerAccountId: string;
  externalSubscriptionId: string;
}): Promise<ExternalSubscription | null> {
  const subAccountId = cleanRequired(input.subAccountId, "subAccountId");
  const provider = cleanRequired(input.provider, "provider");
  const providerAccountId = cleanRequired(
    input.providerAccountId,
    "providerAccountId"
  );
  const externalSubscriptionId = cleanRequired(
    input.externalSubscriptionId,
    "externalSubscriptionId"
  );
  const agencyId = await getSubAccountAgencyId(subAccountId);
  if (!agencyId) return null;
  const id = keyId(
    SUBSCRIPTION_COLLECTION,
    agencyId,
    subAccountId,
    provider,
    providerAccountId,
    externalSubscriptionId
  );
  const snap = await getAdminDb().doc(`${SUBSCRIPTION_COLLECTION}/${id}`).get();
  if (!snap.exists || snap.data()?.subAccountId !== subAccountId) return null;
  return serialize<ExternalSubscription>(snap.id, snap.data()!);
}

/**
 * Webhook lookup for imported subscriptions. The connected account is part of
 * the identity boundary because Stripe subscription ids are only unique within
 * an account, not across all connected accounts.
 */
export async function findExternalSubscriptionByProviderAccountSubscription(input: {
  provider: ExternalBillingProvider;
  providerAccountId: string;
  externalSubscriptionId: string;
}): Promise<ExternalSubscription | null> {
  const provider = cleanRequired(input.provider, "provider");
  const providerAccountId = cleanRequired(
    input.providerAccountId,
    "providerAccountId"
  );
  const externalSubscriptionId = cleanRequired(
    input.externalSubscriptionId,
    "externalSubscriptionId"
  );
  const snap = await getAdminDb()
    .collection(SUBSCRIPTION_COLLECTION)
    .where("provider", "==", provider)
    .where("providerAccountId", "==", providerAccountId)
    .where("externalSubscriptionId", "==", externalSubscriptionId)
    .limit(2)
    .get();
  if (snap.empty) return null;
  if (snap.size > 1) {
    throw new Error(
      "Ambiguous external subscription identity across billing records."
    );
  }
  return serialize<ExternalSubscription>(snap.docs[0].id, snap.docs[0].data());
}

export async function listExternalSubscriptionsForContact(
  subAccountId: string,
  contactId: string
): Promise<ExternalSubscription[]> {
  cleanRequired(subAccountId, "subAccountId");
  cleanRequired(contactId, "contactId");
  const snap = await getAdminDb()
    .collection(SUBSCRIPTION_COLLECTION)
    .where("subAccountId", "==", subAccountId)
    .where("contactId", "==", contactId)
    .get();
  return snap.docs.map((doc) =>
    serialize<ExternalSubscription>(doc.id, doc.data())
  );
}

export async function listExternalSubscriptionsForSubAccount(
  subAccountId: string
): Promise<ExternalSubscription[]> {
  cleanRequired(subAccountId, "subAccountId");
  const snap = await getAdminDb()
    .collection(SUBSCRIPTION_COLLECTION)
    .where("subAccountId", "==", subAccountId)
    .get();
  return snap.docs.map((doc) =>
    serialize<ExternalSubscription>(doc.id, doc.data())
  );
}

export async function listExternalSubscriptionsForBillingCustomer(
  subAccountId: string,
  externalBillingCustomerId: string
): Promise<ExternalSubscription[]> {
  cleanRequired(subAccountId, "subAccountId");
  cleanRequired(externalBillingCustomerId, "externalBillingCustomerId");
  const snap = await getAdminDb()
    .collection(SUBSCRIPTION_COLLECTION)
    .where("subAccountId", "==", subAccountId)
    .where("externalBillingCustomerId", "==", externalBillingCustomerId)
    .get();
  return snap.docs.map((doc) =>
    serialize<ExternalSubscription>(doc.id, doc.data())
  );
}

export async function listExternalSubscriptionsByStatus(
  subAccountId: string,
  status: ExternalSubscriptionStatus
): Promise<ExternalSubscription[]> {
  cleanRequired(subAccountId, "subAccountId");
  const snap = await getAdminDb()
    .collection(SUBSCRIPTION_COLLECTION)
    .where("subAccountId", "==", subAccountId)
    .where("status", "==", status)
    .get();
  return snap.docs.map((doc) =>
    serialize<ExternalSubscription>(doc.id, doc.data())
  );
}

export async function upsertExternalSubscription(
  input: UpsertExternalSubscriptionInput
): Promise<ExternalSubscription> {
  const agencyId = cleanRequired(input.agencyId, "agencyId");
  const subAccountId = cleanRequired(input.subAccountId, "subAccountId");
  const provider = cleanRequired(input.provider, "provider");
  const providerAccountId = cleanRequired(
    input.providerAccountId,
    "providerAccountId"
  );
  const externalCustomerId = cleanRequired(
    input.externalCustomerId,
    "externalCustomerId"
  );
  const externalSubscriptionId = cleanRequired(
    input.externalSubscriptionId,
    "externalSubscriptionId"
  );
  const externalBillingCustomerId = cleanRequired(
    input.externalBillingCustomerId,
    "externalBillingCustomerId"
  );
  const contactId = cleanRequired(input.contactId, "contactId");
  await assertSubAccountTenant(agencyId, subAccountId);
  await assertContactTenant(subAccountId, contactId);
  await assertMemberTenant(subAccountId, input.memberId);

  const customerRef = getAdminDb().doc(
    `${CUSTOMER_COLLECTION}/${externalBillingCustomerId}`
  );
  const customerSnap = await customerRef.get();
  const customer = customerSnap.data();
  if (
    !customerSnap.exists ||
    customer?.agencyId !== agencyId ||
    customer?.subAccountId !== subAccountId ||
    customer?.provider !== provider ||
    customer?.providerAccountId !== providerAccountId ||
    customer?.externalCustomerId !== externalCustomerId
  ) {
    throw new Error(
      "External billing customer does not match the subscription tenant/provider identity."
    );
  }

  const id = keyId(
    SUBSCRIPTION_COLLECTION,
    agencyId,
    subAccountId,
    provider,
    providerAccountId,
    externalSubscriptionId
  );
  const ref = getAdminDb().doc(`${SUBSCRIPTION_COLLECTION}/${id}`);
  const now = FieldValue.serverTimestamp();
  const existing = await ref.get();
  if (existing.exists) {
    assertImmutableIdentity(existing.data()!, {
      agencyId,
      subAccountId,
      provider,
      providerAccountId,
      externalId: externalSubscriptionId,
      externalIdField: "externalSubscriptionId",
    });
  }

  const data = {
    agencyId,
    subAccountId,
    provider,
    providerAccountId,
    providerEnvironment: input.providerEnvironment ?? null,
    externalCustomerId,
    externalSubscriptionId,
    externalBillingCustomerId,
    contactId,
    personId: input.personId ?? null,
    memberId: input.memberId ?? null,
    externalProductId: input.externalProductId ?? null,
    externalPriceId: input.externalPriceId ?? null,
    productName: input.productName?.trim() || null,
    priceName: input.priceName?.trim() || null,
    amountCents: normalizeNonNegativeInteger(input.amountCents, "amountCents"),
    currency: normalizeCurrency(input.currency),
    interval: input.interval?.trim() || null,
    intervalCount: normalizePositiveInteger(
      input.intervalCount,
      "intervalCount"
    ),
    status: normalizeStatus(input.status),
    providerStatus: cleanRequired(input.providerStatus, "providerStatus"),
    currentPeriodStart: input.currentPeriodStart ?? null,
    currentPeriodEnd: input.currentPeriodEnd ?? null,
    cancelAtPeriodEnd: input.cancelAtPeriodEnd === true,
    canceledAt: input.canceledAt ?? null,
    endedAt: input.endedAt ?? null,
    trialStart: input.trialStart ?? null,
    trialEnd: input.trialEnd ?? null,
    source: (input.source ?? "imported") as ExternalBillingSource,
    importedAt: input.importedAt ?? null,
    importedByUid: input.importedByUid ?? null,
    lastProviderEventCreatedAt: input.lastProviderEventCreatedAt ?? null,
    metadata: (input.metadata ?? null) as ExternalBillingMetadata | null,
    ...(existing.exists ? {} : { createdAt: now }),
    updatedAt: now,
  };
  await ref.set(data, { merge: true });
  const saved = await ref.get();
  return serialize<ExternalSubscription>(ref.id, saved.data()!);
}
