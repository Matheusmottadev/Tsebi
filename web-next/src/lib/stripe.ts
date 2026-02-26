import { loadStripe } from "@stripe/stripe-js";

const publishableKey = String(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || "").trim();

export const stripePromise = publishableKey ? loadStripe(publishableKey) : null;

export function hasStripePublishableKey(): boolean {
  return Boolean(publishableKey);
}
