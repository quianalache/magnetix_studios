import type {
  BillingAddressMode,
  BuyerNameFormat,
  CheckoutAgreement,
  CheckoutDisplay,
  CheckoutFormat,
  OrderTotals,
  PhoneRequirement,
} from "@/types/checkout";

/**
 * Everything the shared checkout renderer needs, resolved on the server
 * from the checkout config + live Offers. Client-safe (no secrets). The
 * same shape feeds the public checkout page, the admin live preview and,
 * later, the Page Builder Checkout block.
 */
export interface CheckoutViewOffer {
  offerId: string;
  title: string;
  description: string;
  thumbnailUrl: string | null;
  priceLabel: string;
  billingNote: string | null;
  entitlements: string[];
}

export interface CheckoutViewBump {
  bumpId: string;
  offerId: string;
  headline: string;
  description: string;
  imageUrl: string | null;
  badge: string;
  checkboxLabel: string;
  priceLabel: string;
}

export interface CheckoutView {
  configId: string;
  subAccountId: string;
  brand: { name: string; logoUrl: string | null; primary: string | null };
  format: CheckoutFormat;
  nameFormat: BuyerNameFormat;
  phone: PhoneRequirement;
  billingAddress: BillingAddressMode;
  agreement: CheckoutAgreement;
  couponsEnabled: boolean;
  display: CheckoutDisplay;
  primary: CheckoutViewOffer;
  bumps: CheckoutViewBump[];
  /** Totals with no bumps and no coupon (the starting state). */
  initialTotals: OrderTotals;
  payment: {
    ready: boolean;
    mode: "test" | "live" | null;
    message: string | null;
    /** Browser key for the payment mode, and the connected account (both public). */
    publishableKey: string | null;
    stripeAccount: string | null;
  };
  preview: boolean;
}
