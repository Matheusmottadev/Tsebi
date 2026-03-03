"use client";

import posthog from "posthog-js";

export type CommerceEventName =
  | "view_item"
  | "view_item_list"
  | "search"
  | "add_to_cart"
  | "remove_from_cart"
  | "begin_checkout"
  | "purchase"
  | "favorite_toggle"
  | "view_recommendations"
  | "click_recommendation";

type CommerceEventPayload = {
  eventName: CommerceEventName;
  userId?: string;
  anonId?: string;
  productId?: string;
  category?: string;
  price?: number;
  currency?: string;
  source?: string;
  query?: string;
  attributes?: Record<string, unknown>;
  meta?: Record<string, unknown>;
  eventId?: string;
};

const ANON_STORAGE_KEY = "tsebi.anon_id.v1";

function normalizeText(value: unknown): string {
  return String(value || "").trim();
}

function getMetaCookie(name: string): string {
  if (typeof document === "undefined") return "";
  const prefixed = `${name}=`;
  const parts = document.cookie.split(";").map((entry) => entry.trim());
  const found = parts.find((entry) => entry.startsWith(prefixed));
  if (!found) return "";
  return decodeURIComponent(found.slice(prefixed.length));
}

export function getOrCreateAnonId(): string {
  if (typeof window === "undefined") return "";
  const existing = normalizeText(window.localStorage.getItem(ANON_STORAGE_KEY));
  if (existing) return existing;
  const generated = `anon_${crypto.randomUUID()}`;
  window.localStorage.setItem(ANON_STORAGE_KEY, generated);
  return generated;
}

function mapMetaEventName(name: CommerceEventName): string {
  if (name === "view_item") return "ViewContent";
  if (name === "search") return "Search";
  if (name === "add_to_cart") return "AddToCart";
  if (name === "begin_checkout") return "InitiateCheckout";
  if (name === "purchase") return "Purchase";
  return "CustomEvent";
}

function trackMetaPixel(name: CommerceEventName, payload: CommerceEventPayload) {
  if (typeof window === "undefined") return;
  const fbq = (window as Window & { fbq?: (...args: unknown[]) => void }).fbq;
  if (typeof fbq !== "function") return;
  const mapped = mapMetaEventName(name);
  const customData = {
    content_ids: payload.productId ? [payload.productId] : [],
    content_category: payload.category || "",
    content_type: "product",
    currency: normalizeText(payload.currency) || "brl",
    value: Math.max(0, Number(payload.price || 0) / 100),
    source: payload.source || "",
    query: payload.query || "",
  };
  fbq("track", mapped, customData, { eventID: payload.eventId });
}

function capturePosthog(name: CommerceEventName, payload: CommerceEventPayload) {
  if (typeof window === "undefined") return;
  if (!posthog || typeof posthog.capture !== "function") return;
  posthog.capture(name, {
    event_id: payload.eventId || "",
    user_id: payload.userId || "",
    anon_id: payload.anonId || "",
    product_id: payload.productId || "",
    category: payload.category || "",
    price: Number(payload.price || 0),
    currency: payload.currency || "brl",
    source: payload.source || "",
    query: payload.query || "",
    ...(payload.attributes || {}),
  });
}

export async function trackCommerceEvent(input: CommerceEventPayload): Promise<void> {
  if (typeof window === "undefined") return;

  const eventId = normalizeText(input.eventId) || crypto.randomUUID();
  const anonId = normalizeText(input.anonId) || getOrCreateAnonId();
  const storedUserId = normalizeText(window.localStorage.getItem("tsebi.user_id"));
  const userId = normalizeText(input.userId) || storedUserId;
  const payload: CommerceEventPayload = {
    ...input,
    eventId,
    anonId,
    userId,
    currency: normalizeText(input.currency) || "brl",
  };

  capturePosthog(payload.eventName, payload);
  trackMetaPixel(payload.eventName, payload);

  await fetch("/api/events", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-anon-id": anonId,
      "x-fbp": getMetaCookie("_fbp"),
      "x-fbc": getMetaCookie("_fbc"),
    },
    credentials: "include",
    body: JSON.stringify(payload),
  }).catch(() => {});
}

export async function identifyUser(anonId: string, userId: string): Promise<void> {
  const safeAnon = normalizeText(anonId);
  const safeUser = normalizeText(userId);
  if (!safeAnon || !safeUser) return;
  await fetch("/api/identify", {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "include",
    body: JSON.stringify({
      anon_id: safeAnon,
      user_id: safeUser,
    }),
  }).catch(() => {});
}
