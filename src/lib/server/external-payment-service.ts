import "server-only";

import { createHash } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import type {
  ExternalBillingMetadata,
  ExternalBillingProvider,
  ExternalBillingSource,
  ExternalPayment,
  ExternalPaymentStatus,
  ExternalPaymentType,
} from "@/types/external-billing";

const PAYMENT_COLLECTION = "externalPayments";

export type UpsertExternalPaymentInput = Omit<
  ExternalPayment,
  "id" | "createdAt" | "updatedAt" | "netAmountCents"
>;

function cleanRequired(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${field} is required.`);
  }
  return value.trim();
}

function cleanNullableText(
  value: string | null | undefined,
  field: string,
  maxLength = 1000
): string | null {
  if (value == null) return null;
  if (typeof value !== "string")
    throw new Error(`${field} must be a string or null.`);
  const cleaned = value.trim();
  if (!cleaned) return null;
  if (cleaned.length > maxLength) {
    throw new Error(`${field} must be ${maxLength} characters or fewer.`);
  }
  return cleaned;
}

function normalizeCurrency(currency: unknown): string {
  const normalized = cleanRequired(currency, "currency").toLowerCase();
  if (!/^[a-z]{3}$/.test(normalized)) {
    throw new Error("currency must be a 3-letter ISO currency code.");
  }
  return normalized;
}

function normalizeNonNegativeInteger(value: unknown, field: string): number {
  if (!Number.isInteger(value) || (value as number) < 0) {
    throw new Error(`${field} must be a non-negative integer.`);
  }
  return value as number;
}

function normalizePaymentStatus(value: unknown): ExternalPaymentStatus {
  switch (value) {
    case "pending":
    case "succeeded":
    case "failed":
    case "refunded":
    case "partially_refunded":
    case "canceled":
    case "requires_action":
      return value;
    default:
      return "unknown";
  }
}

function normalizePaymentType(value: unknown): ExternalPaymentType {
  switch (value) {
    case "subscription":
    case "one_time":
    case "invoice":
    case "other":
      return value;
    default:
      return "other";
  }
}

function paymentStatusRank(value: unknown): number {
  switch (value) {
    case "refunded":
      return 4;
    case "partially_refunded":
      return 3;
    case "succeeded":
      return 2;
    case "failed":
      return 1;
    default:
      return 0;
  }
}

function normalizeSafeUrl(
  value: string | null | undefined,
  field: string
): string | null {
  const cleaned = cleanNullableText(value, field, 2000);
  if (!cleaned) return null;
  try {
    const url = new URL(cleaned);
    if (url.protocol !== "https:") throw new Error();
    return url.toString();
  } catch {
    throw new Error(`${field} must be a valid HTTPS URL or null.`);
  }
}

function normalizeSafeMetadata(
  value: ExternalBillingMetadata | null | undefined
): ExternalBillingMetadata | null {
  if (!value) return null;
  const forbiddenKey = /(?:payment.?method|card|bank|cvc|cvv|secret)/i;
  const metadata: ExternalBillingMetadata = {};
  for (const [key, item] of Object.entries(value)) {
    if (!key.trim() || forbiddenKey.test(key)) {
      throw new Error(
        "Payment metadata may not contain payment-method or secret fields."
      );
    }
    metadata[key] = item;
  }
  return metadata;
}

function paymentId(
  agencyId: string,
  subAccountId: string,
  provider: string,
  providerAccountId: string,
  externalPaymentId: string
): string {
  const identity = [
    PAYMENT_COLLECTION,
    agencyId,
    subAccountId,
    provider,
    providerAccountId,
    externalPaymentId,
  ].join("\u001f");
  return `payment_${createHash("sha256").update(identity).digest("hex")}`;
}

function serialize(
  id: string,
  data: FirebaseFirestore.DocumentData
): ExternalPayment {
  return { id, ...data } as ExternalPayment;
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

async function assertSubAccountTenant(
  agencyId: string,
  subAccountId: string
): Promise<void> {
  if ((await getSubAccountAgencyId(subAccountId)) !== agencyId) {
    throw new Error("Sub-account does not belong to the supplied agency.");
  }
}

async function assertContactTenant(
  subAccountId: string,
  contactId: string
): Promise<void> {
  const snap = await getAdminDb().doc(`contacts/${contactId}`).get();
  if (!snap.exists || snap.data()?.subAccountId !== subAccountId) {
    throw new Error("Contact does not belong to the supplied sub-account.");
  }
}

async function assertMemberAndPersonRelationship(input: {
  subAccountId: string;
  contactId: string;
  memberId: string | null;
  personId: string | null;
}): Promise<void> {
  if (!input.memberId) return;
  const snap = await getAdminDb()
    .doc(`subAccounts/${input.subAccountId}/members/${input.memberId}`)
    .get();
  const member = snap.data();
  if (!snap.exists || member?.contactId !== input.contactId) {
    throw new Error("Member does not match the supplied contact/sub-account.");
  }
  if (input.personId && member?.personId !== input.personId) {
    throw new Error("Member does not match the supplied person.");
  }
}

function assertExistingField(
  existing: FirebaseFirestore.DocumentData,
  field: string,
  incoming: unknown
): void {
  if (existing[field] !== incoming) {
    throw new Error(
      `Cannot change immutable external payment field: ${field}.`
    );
  }
}

function preserveRelationship(
  existing: FirebaseFirestore.DocumentData | undefined,
  field: string,
  incoming: string | null
): string | null {
  const current = existing?.[field];
  if (current != null && current !== incoming) {
    throw new Error(`Cannot reassign established external payment ${field}.`);
  }
  return current ?? incoming;
}

async function assertExternalRelationships(input: {
  agencyId: string;
  subAccountId: string;
  provider: string;
  providerAccountId: string;
  contactId: string;
  memberId: string | null;
  personId: string | null;
  externalCustomerId: string | null;
  externalSubscriptionId: string | null;
  externalBillingCustomerId: string | null;
  externalSubscriptionRecordId: string | null;
}): Promise<void> {
  const db = getAdminDb();
  const [customerSnap, subscriptionSnap] = await Promise.all([
    input.externalBillingCustomerId
      ? db
          .doc(`externalBillingCustomers/${input.externalBillingCustomerId}`)
          .get()
      : Promise.resolve(null),
    input.externalSubscriptionRecordId
      ? db
          .doc(`externalSubscriptions/${input.externalSubscriptionRecordId}`)
          .get()
      : Promise.resolve(null),
  ]);

  if (customerSnap) {
    const customer = customerSnap.data();
    if (
      !customerSnap.exists ||
      customer?.agencyId !== input.agencyId ||
      customer?.subAccountId !== input.subAccountId ||
      customer?.provider !== input.provider ||
      customer?.providerAccountId !== input.providerAccountId ||
      customer?.contactId !== input.contactId ||
      (input.externalCustomerId &&
        customer?.externalCustomerId !== input.externalCustomerId) ||
      (input.memberId &&
        customer?.memberId &&
        customer.memberId !== input.memberId) ||
      (input.personId &&
        customer?.personId &&
        customer.personId !== input.personId)
    ) {
      throw new Error(
        "External billing customer does not match payment relationships."
      );
    }
  }

  if (subscriptionSnap) {
    const subscription = subscriptionSnap.data();
    if (
      !subscriptionSnap.exists ||
      subscription?.agencyId !== input.agencyId ||
      subscription?.subAccountId !== input.subAccountId ||
      subscription?.provider !== input.provider ||
      subscription?.providerAccountId !== input.providerAccountId ||
      subscription?.contactId !== input.contactId ||
      (input.externalCustomerId &&
        subscription?.externalCustomerId !== input.externalCustomerId) ||
      (input.externalSubscriptionId &&
        subscription?.externalSubscriptionId !==
          input.externalSubscriptionId) ||
      (input.externalBillingCustomerId &&
        subscription?.externalBillingCustomerId !==
          input.externalBillingCustomerId) ||
      (input.memberId &&
        subscription?.memberId &&
        subscription.memberId !== input.memberId) ||
      (input.personId &&
        subscription?.personId &&
        subscription.personId !== input.personId)
    ) {
      throw new Error(
        "External subscription does not match payment relationships."
      );
    }
  }
}

export async function getExternalPaymentById(
  subAccountId: string,
  id: string
): Promise<ExternalPayment | null> {
  const safeSubAccountId = cleanRequired(subAccountId, "subAccountId");
  const safeId = cleanRequired(id, "id");
  const snap = await getAdminDb().doc(`${PAYMENT_COLLECTION}/${safeId}`).get();
  if (!snap.exists || snap.data()?.subAccountId !== safeSubAccountId)
    return null;
  return serialize(snap.id, snap.data()!);
}

export async function findExternalPaymentByProviderPayment(input: {
  subAccountId: string;
  provider: ExternalBillingProvider;
  providerAccountId: string;
  externalPaymentId: string;
}): Promise<ExternalPayment | null> {
  const subAccountId = cleanRequired(input.subAccountId, "subAccountId");
  const provider = cleanRequired(input.provider, "provider");
  const providerAccountId = cleanRequired(
    input.providerAccountId,
    "providerAccountId"
  );
  const externalPaymentId = cleanRequired(
    input.externalPaymentId,
    "externalPaymentId"
  );
  const agencyId = await getSubAccountAgencyId(subAccountId);
  if (!agencyId) return null;
  const id = paymentId(
    agencyId,
    subAccountId,
    provider,
    providerAccountId,
    externalPaymentId
  );
  return getExternalPaymentById(subAccountId, id);
}

/**
 * Charge ids are not canonical payment identities, but this lookup lets a
 * later refund event find an already-linked legacy/direct-charge ledger row.
 */
export async function findExternalPaymentByProviderCharge(input: {
  provider: ExternalBillingProvider;
  providerAccountId: string;
  externalChargeId: string;
}): Promise<ExternalPayment | null> {
  const provider = cleanRequired(input.provider, "provider");
  const providerAccountId = cleanRequired(
    input.providerAccountId,
    "providerAccountId"
  );
  const externalChargeId = cleanRequired(
    input.externalChargeId,
    "externalChargeId"
  );
  const snap = await getAdminDb()
    .collection(PAYMENT_COLLECTION)
    .where("provider", "==", provider)
    .where("providerAccountId", "==", providerAccountId)
    .where("externalChargeId", "==", externalChargeId)
    .limit(2)
    .get();
  if (snap.empty) return null;
  if (snap.size > 1) {
    throw new Error("Ambiguous external payment charge identity.");
  }
  return serialize(snap.docs[0].id, snap.docs[0].data());
}

async function listExternalPayments(
  subAccountId: string,
  field:
    | "contactId"
    | "externalSubscriptionRecordId"
    | "externalBillingCustomerId",
  value: string
): Promise<ExternalPayment[]> {
  const safeSubAccountId = cleanRequired(subAccountId, "subAccountId");
  const safeValue = cleanRequired(value, field);
  const snap = await getAdminDb()
    .collection(PAYMENT_COLLECTION)
    .where("subAccountId", "==", safeSubAccountId)
    .where(field, "==", safeValue)
    .orderBy("occurredAt", "desc")
    .get();
  return snap.docs.map((doc) => serialize(doc.id, doc.data()));
}

export async function listExternalPaymentsForContact(
  subAccountId: string,
  contactId: string
): Promise<ExternalPayment[]> {
  return listExternalPayments(subAccountId, "contactId", contactId);
}

export async function listExternalPaymentsForSubscription(
  subAccountId: string,
  externalSubscriptionRecordId: string
): Promise<ExternalPayment[]> {
  return listExternalPayments(
    subAccountId,
    "externalSubscriptionRecordId",
    externalSubscriptionRecordId
  );
}

export async function listExternalPaymentsForBillingCustomer(
  subAccountId: string,
  externalBillingCustomerId: string
): Promise<ExternalPayment[]> {
  return listExternalPayments(
    subAccountId,
    "externalBillingCustomerId",
    externalBillingCustomerId
  );
}

export async function upsertExternalPayment(
  input: UpsertExternalPaymentInput
): Promise<ExternalPayment> {
  const agencyId = cleanRequired(input.agencyId, "agencyId");
  const subAccountId = cleanRequired(input.subAccountId, "subAccountId");
  const provider = cleanRequired(input.provider, "provider");
  const providerAccountId = cleanRequired(
    input.providerAccountId,
    "providerAccountId"
  );
  const externalPaymentId = cleanRequired(
    input.externalPaymentId,
    "externalPaymentId"
  );
  const contactId = cleanRequired(input.contactId, "contactId");
  const memberId = cleanNullableText(input.memberId, "memberId", 500);
  const personId = cleanNullableText(input.personId, "personId", 500);
  const externalCustomerId = cleanNullableText(
    input.externalCustomerId,
    "externalCustomerId",
    500
  );
  const externalSubscriptionId = cleanNullableText(
    input.externalSubscriptionId,
    "externalSubscriptionId",
    500
  );
  const externalBillingCustomerId = cleanNullableText(
    input.externalBillingCustomerId,
    "externalBillingCustomerId",
    500
  );
  const externalSubscriptionRecordId = cleanNullableText(
    input.externalSubscriptionRecordId,
    "externalSubscriptionRecordId",
    500
  );
  const amountCents = normalizeNonNegativeInteger(
    input.amountCents,
    "amountCents"
  );
  const amountRefundedCents = normalizeNonNegativeInteger(
    input.amountRefundedCents,
    "amountRefundedCents"
  );
  if (amountRefundedCents > amountCents) {
    throw new Error("amountRefundedCents cannot exceed amountCents.");
  }
  if (input.occurredAt == null) throw new Error("occurredAt is required.");
  const lastProviderEventCreatedAt =
    input.lastProviderEventCreatedAt == null
      ? null
      : normalizeNonNegativeInteger(
          input.lastProviderEventCreatedAt,
          "lastProviderEventCreatedAt"
        );

  await assertSubAccountTenant(agencyId, subAccountId);
  await assertContactTenant(subAccountId, contactId);
  await assertMemberAndPersonRelationship({
    subAccountId,
    contactId,
    memberId,
    personId,
  });
  await assertExternalRelationships({
    agencyId,
    subAccountId,
    provider,
    providerAccountId,
    contactId,
    memberId,
    personId,
    externalCustomerId,
    externalSubscriptionId,
    externalBillingCustomerId,
    externalSubscriptionRecordId,
  });

  const id = paymentId(
    agencyId,
    subAccountId,
    provider,
    providerAccountId,
    externalPaymentId
  );
  const ref = getAdminDb().doc(`${PAYMENT_COLLECTION}/${id}`);
  const existingSnap = await ref.get();
  const existing = existingSnap.data();
  if (existing) {
    for (const [field, value] of [
      ["agencyId", agencyId],
      ["subAccountId", subAccountId],
      ["provider", provider],
      ["providerAccountId", providerAccountId],
      ["externalPaymentId", externalPaymentId],
      ["contactId", contactId],
    ] as const) {
      assertExistingField(existing, field, value);
    }
  }

  const source = (input.source ?? "synced") as ExternalBillingSource;
  const data = {
    agencyId,
    subAccountId,
    provider,
    providerAccountId,
    externalPaymentId,
    externalCustomerId: preserveRelationship(
      existing,
      "externalCustomerId",
      externalCustomerId
    ),
    externalSubscriptionId: preserveRelationship(
      existing,
      "externalSubscriptionId",
      externalSubscriptionId
    ),
    externalInvoiceId: preserveRelationship(
      existing,
      "externalInvoiceId",
      cleanNullableText(input.externalInvoiceId, "externalInvoiceId", 500)
    ),
    externalChargeId: preserveRelationship(
      existing,
      "externalChargeId",
      cleanNullableText(input.externalChargeId, "externalChargeId", 500)
    ),
    externalPaymentIntentId: preserveRelationship(
      existing,
      "externalPaymentIntentId",
      cleanNullableText(
        input.externalPaymentIntentId,
        "externalPaymentIntentId",
        500
      )
    ),
    externalBillingCustomerId: preserveRelationship(
      existing,
      "externalBillingCustomerId",
      externalBillingCustomerId
    ),
    externalSubscriptionRecordId: preserveRelationship(
      existing,
      "externalSubscriptionRecordId",
      externalSubscriptionRecordId
    ),
    contactId,
    memberId: preserveRelationship(existing, "memberId", memberId),
    personId: preserveRelationship(existing, "personId", personId),
    productName: cleanNullableText(input.productName, "productName", 500),
    description: cleanNullableText(input.description, "description"),
    amountCents,
    amountRefundedCents,
    netAmountCents: amountCents - amountRefundedCents,
    currency: normalizeCurrency(input.currency),
    status: normalizePaymentStatus(input.status),
    providerStatus: cleanRequired(input.providerStatus, "providerStatus"),
    paymentType: normalizePaymentType(input.paymentType),
    occurredAt: input.occurredAt,
    paidAt: input.paidAt ?? null,
    failedAt: input.failedAt ?? null,
    refundedAt: input.refundedAt ?? null,
    receiptUrl: normalizeSafeUrl(input.receiptUrl, "receiptUrl"),
    invoiceHostedUrl: normalizeSafeUrl(
      input.invoiceHostedUrl,
      "invoiceHostedUrl"
    ),
    invoicePdfUrl: normalizeSafeUrl(input.invoicePdfUrl, "invoicePdfUrl"),
    failureCode: cleanNullableText(input.failureCode, "failureCode", 255),
    failureMessage: cleanNullableText(input.failureMessage, "failureMessage"),
    source,
    lastProviderEventCreatedAt:
      lastProviderEventCreatedAt ??
      (existing?.lastProviderEventCreatedAt as number | null | undefined) ??
      null,
    metadata: normalizeSafeMetadata(input.metadata),
    ...(existingSnap.exists ? {} : { createdAt: FieldValue.serverTimestamp() }),
    updatedAt: FieldValue.serverTimestamp(),
  };

  await getAdminDb().runTransaction(async (transaction) => {
    const currentSnap = await transaction.get(ref);
    const current = currentSnap.data();
    const currentEvent = current?.lastProviderEventCreatedAt;
    if (
      typeof currentEvent === "number" &&
      lastProviderEventCreatedAt !== null &&
      lastProviderEventCreatedAt < currentEvent
    ) {
      return;
    }
    if (
      typeof currentEvent === "number" &&
      lastProviderEventCreatedAt !== null &&
      lastProviderEventCreatedAt === currentEvent &&
      paymentStatusRank(current?.status) > paymentStatusRank(data.status)
    ) {
      return;
    }
    if (
      lastProviderEventCreatedAt === null &&
      paymentStatusRank(current?.status) > paymentStatusRank(data.status)
    ) {
      return;
    }
    if (current) {
      for (const [field, value] of [
        ["agencyId", agencyId],
        ["subAccountId", subAccountId],
        ["provider", provider],
        ["providerAccountId", providerAccountId],
        ["externalPaymentId", externalPaymentId],
        ["contactId", contactId],
      ] as const) {
        assertExistingField(current, field, value);
      }
    }
    transaction.set(
      ref,
      {
        ...data,
        // A read-only historical import must not erase webhook provenance or
        // advance the webhook ordering marker. A later webhook remains the
        // authoritative source of current provider state.
        ...(source === "historical_backfill" && current
          ? {
              source: current.source ?? source,
              lastProviderEventCreatedAt:
                current.lastProviderEventCreatedAt ?? null,
            }
          : {}),
      },
      { merge: true }
    );
  });
  const saved = await ref.get();
  return serialize(ref.id, saved.data()!);
}
