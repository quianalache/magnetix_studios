export interface ImportStripeSubscriptionRequest {
  externalCustomerId: string;
  externalSubscriptionId: string;
  contactId: string;
}

export interface ImportStripeSubscriptionResult {
  externalBillingCustomer: import("./external-billing").ExternalBillingCustomer;
  externalSubscription: import("./external-billing").ExternalSubscription;
  customerChange: "created" | "updated";
  subscriptionChange: "created" | "updated";
  contactId: string;
  memberId: string | null;
  personId: string | null;
  source: "imported";
  importedAt: string;
}
