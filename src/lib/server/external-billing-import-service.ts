import "server-only";

import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import {
  getStripeCustomerForSubAccount,
  getStripeSubscriptionForSubAccount,
  StripeDiscoveryError,
} from "@/lib/stripe/discovery";
import {
  findExternalBillingCustomerByProviderCustomer,
  findExternalSubscriptionByProviderSubscription,
  upsertExternalBillingCustomer,
  upsertExternalSubscription,
} from "@/lib/server/external-billing-service";
import type {
  ExternalBillingCustomer,
  ExternalSubscription,
  ExternalSubscriptionStatus,
} from "@/types/external-billing";
import type {
  ImportStripeSubscriptionRequest,
  ImportStripeSubscriptionResult,
} from "@/types/external-billing-import";

export type ExternalBillingImportErrorCode =
  | "INVALID_REQUEST"
  | "SUB_ACCOUNT_NOT_FOUND"
  | "CONTACT_NOT_FOUND"
  | "CONTACT_TENANT_MISMATCH"
  | "EMAIL_MISMATCH"
  | "CUSTOMER_SUBSCRIPTION_MISMATCH"
  | "CUSTOMER_ALREADY_LINKED"
  | "SUBSCRIPTION_ALREADY_LINKED"
  | "IMPORT_CONFLICT";

export class ExternalBillingImportError extends Error {
  constructor(
    public readonly code: ExternalBillingImportErrorCode,
    message: string,
    public readonly status = 409
  ) {
    super(message);
    this.name = "ExternalBillingImportError";
  }
}

function required(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new ExternalBillingImportError(
      "INVALID_REQUEST",
      `${field} is required.`,
      400
    );
  }
  return value.trim();
}

function normalizeEmail(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return normalized || null;
}

function timestamp(value: string | null): Date | null {
  return value ? new Date(value) : null;
}

function normalizeSubscriptionStatus(
  value: string
): ExternalSubscriptionStatus {
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

function importError(error: unknown): never {
  if (error instanceof ExternalBillingImportError) throw error;
  if (error instanceof StripeDiscoveryError) throw error;
  throw error;
}

async function readTenant(subAccountId: string): Promise<{
  agencyId: string;
  providerAccountId: string;
}> {
  const snap = await getAdminDb().doc(`subAccounts/${subAccountId}`).get();
  if (!snap.exists || typeof snap.data()?.agencyId !== "string") {
    throw new ExternalBillingImportError(
      "SUB_ACCOUNT_NOT_FOUND",
      "Sub-account not found.",
      404
    );
  }
  const providerAccountId = (
    snap.data()?.stripeConnect?.accountId as string | undefined
  )?.trim();
  if (!providerAccountId) {
    throw new StripeDiscoveryError(
      "STRIPE_NOT_CONNECTED",
      "This sub-account does not have a connected Stripe account.",
      409
    );
  }
  return { agencyId: snap.data()!.agencyId as string, providerAccountId };
}

async function readContact(
  subAccountId: string,
  contactId: string
): Promise<{
  email: string | null;
}> {
  const snap = await getAdminDb().doc(`contacts/${contactId}`).get();
  if (!snap.exists) {
    throw new ExternalBillingImportError(
      "CONTACT_NOT_FOUND",
      "Contact not found.",
      404
    );
  }
  const data = snap.data() ?? {};
  if (data.subAccountId !== subAccountId) {
    throw new ExternalBillingImportError(
      "CONTACT_TENANT_MISMATCH",
      "Contact does not belong to the supplied sub-account.",
      409
    );
  }
  return { email: normalizeEmail(data.email) };
}

async function resolveMemberLink(
  subAccountId: string,
  contactId: string
): Promise<{ memberId: string | null; personId: string | null }> {
  const snap = await getAdminDb()
    .collection(`subAccounts/${subAccountId}/members`)
    .where("contactId", "==", contactId)
    .get();
  if (snap.size !== 1) return { memberId: null, personId: null };
  const member = snap.docs[0].data();
  return {
    memberId: snap.docs[0].id,
    personId: typeof member.personId === "string" ? member.personId : null,
  };
}

function customerChange(
  existing: ExternalBillingCustomer | null,
  contactId: string
): "created" | "updated" {
  if (existing && existing.contactId !== contactId) {
    throw new ExternalBillingImportError(
      "CUSTOMER_ALREADY_LINKED",
      "This external Stripe customer is already linked to a different contact."
    );
  }
  return existing ? "updated" : "created";
}

function subscriptionChange(
  existing: ExternalSubscription | null,
  contactId: string
): "created" | "updated" {
  if (existing && existing.contactId !== contactId) {
    throw new ExternalBillingImportError(
      "SUBSCRIPTION_ALREADY_LINKED",
      "This external Stripe subscription is already linked to a different contact."
    );
  }
  return existing ? "updated" : "created";
}

export async function importStripeSubscriptionForContact(input: {
  subAccountId: string;
  importedByUid: string;
  request: ImportStripeSubscriptionRequest;
}): Promise<ImportStripeSubscriptionResult> {
  const subAccountId = required(input.subAccountId, "subAccountId");
  const importedByUid = required(input.importedByUid, "importedByUid");
  const externalCustomerId = required(
    input.request?.externalCustomerId,
    "externalCustomerId"
  );
  const externalSubscriptionId = required(
    input.request?.externalSubscriptionId,
    "externalSubscriptionId"
  );
  const contactId = required(input.request?.contactId, "contactId");

  const { agencyId, providerAccountId } = await readTenant(subAccountId);
  const contact = await readContact(subAccountId, contactId);

  let stripeCustomer;
  let stripeSubscription;
  try {
    stripeCustomer = await getStripeCustomerForSubAccount(
      subAccountId,
      externalCustomerId
    );
    stripeSubscription = await getStripeSubscriptionForSubAccount(
      subAccountId,
      externalSubscriptionId
    );
  } catch (error) {
    return importError(error);
  }

  if (stripeCustomer.providerAccountId !== providerAccountId) {
    throw new ExternalBillingImportError(
      "IMPORT_CONFLICT",
      "Stripe customer account does not match the connected sub-account."
    );
  }
  if (stripeSubscription.providerAccountId !== providerAccountId) {
    throw new ExternalBillingImportError(
      "IMPORT_CONFLICT",
      "Stripe subscription account does not match the connected sub-account."
    );
  }
  if (stripeSubscription.externalCustomerId !== externalCustomerId) {
    throw new ExternalBillingImportError(
      "CUSTOMER_SUBSCRIPTION_MISMATCH",
      "The selected Stripe subscription belongs to a different Stripe customer."
    );
  }

  const stripeEmail = normalizeEmail(stripeCustomer.email);
  if (!stripeEmail) {
    throw new ExternalBillingImportError(
      "EMAIL_MISMATCH",
      "The Stripe customer has no usable email address and cannot be imported into the current billing model."
    );
  }
  if (contact.email && stripeEmail !== contact.email) {
    throw new ExternalBillingImportError(
      "EMAIL_MISMATCH",
      "The Stripe customer email does not match the selected CRM contact."
    );
  }

  const existingCustomer = await findExternalBillingCustomerByProviderCustomer({
    subAccountId,
    provider: "stripe",
    providerAccountId,
    externalCustomerId,
  });
  const existingSubscription =
    await findExternalSubscriptionByProviderSubscription({
      subAccountId,
      provider: "stripe",
      providerAccountId,
      externalSubscriptionId,
    });
  const customerChangeResult = customerChange(existingCustomer, contactId);
  const subscriptionChangeResult = subscriptionChange(
    existingSubscription,
    contactId
  );
  const { memberId, personId } = await resolveMemberLink(
    subAccountId,
    contactId
  );
  const importedAt = new Date();
  const firstItem = stripeSubscription.items[0];

  const externalBillingCustomer = await upsertExternalBillingCustomer({
    agencyId,
    subAccountId,
    provider: "stripe",
    providerAccountId,
    externalCustomerId,
    contactId,
    personId,
    memberId,
    email: stripeEmail,
    name: stripeCustomer.name,
    status: "active",
    source: "imported",
    importedAt: FieldValue.serverTimestamp(),
    importedByUid,
  });

  const externalSubscription = await upsertExternalSubscription({
    agencyId,
    subAccountId,
    provider: "stripe",
    providerAccountId,
    externalCustomerId,
    externalSubscriptionId,
    externalBillingCustomerId: externalBillingCustomer.id,
    contactId,
    personId,
    memberId,
    externalProductId: firstItem?.productId ?? null,
    externalPriceId: firstItem?.priceId ?? null,
    productName: firstItem?.productName ?? null,
    priceName: firstItem?.priceName ?? null,
    amountCents: firstItem?.unitAmount ?? null,
    currency: firstItem?.currency ?? null,
    interval: firstItem?.recurringInterval ?? null,
    intervalCount: firstItem?.recurringIntervalCount ?? null,
    status: normalizeSubscriptionStatus(stripeSubscription.status),
    providerStatus: stripeSubscription.providerStatus,
    currentPeriodStart: timestamp(stripeSubscription.currentPeriodStart),
    currentPeriodEnd: timestamp(stripeSubscription.currentPeriodEnd),
    cancelAtPeriodEnd: stripeSubscription.cancelAtPeriodEnd,
    canceledAt: timestamp(stripeSubscription.canceledAt),
    endedAt: timestamp(stripeSubscription.endedAt),
    trialStart: timestamp(stripeSubscription.trialStart),
    trialEnd: timestamp(stripeSubscription.trialEnd),
    source: "imported",
    importedAt: FieldValue.serverTimestamp(),
    importedByUid,
    lastProviderEventCreatedAt: null,
    metadata: stripeSubscription.metadata,
  });

  return {
    externalBillingCustomer,
    externalSubscription,
    customerChange: customerChangeResult,
    subscriptionChange: subscriptionChangeResult,
    contactId,
    memberId,
    personId,
    source: "imported",
    importedAt: importedAt.toISOString(),
  };
}
