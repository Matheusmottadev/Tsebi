import { loadStripe } from "@stripe/stripe-js";
import { get } from "@/lib/http";

const publishableKey = String(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY || "").trim();

type ApiConfigResponse = {
  stripePublishableKey?: string;
};

let cachedStripePromise: Promise<import("@stripe/stripe-js").Stripe | null> | null = null;

export function resolveStripePromise(): Promise<import("@stripe/stripe-js").Stripe | null> {
  if (cachedStripePromise) return cachedStripePromise;

  cachedStripePromise = (async () => {
    const envKey = String(publishableKey || "").trim();
    if (envKey) return loadStripe(envKey);

    try {
      const config = await get<ApiConfigResponse>("/api/config", { cache: "no-store" });
      const apiKey = String(config?.stripePublishableKey || "").trim();
      if (!apiKey) return null;
      return loadStripe(apiKey);
    } catch {
      return null;
    }
  })();

  return cachedStripePromise;
}

export function hasStripePublishableKey(): boolean {
  return Boolean(publishableKey);
}
