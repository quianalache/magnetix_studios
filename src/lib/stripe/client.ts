import { loadStripe, type Stripe } from "@stripe/stripe-js";

const stripePromises = new Map<string, Promise<Stripe | null>>();

export function getStripe(
  publishableKey = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY!,
  stripeAccount?: string | null,
): Promise<Stripe | null> {
  const cacheKey = `${publishableKey}:${stripeAccount ?? ""}`;
  const existing = stripePromises.get(cacheKey);
  if (existing) return existing;
  const promise = loadStripe(
    publishableKey,
    stripeAccount ? { stripeAccount } : undefined,
  );
  stripePromises.set(cacheKey, promise);
  return promise;
}
