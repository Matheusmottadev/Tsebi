"use client";

import { ChangeEvent, FocusEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Elements } from "@stripe/react-stripe-js";
import type { Stripe } from "@stripe/stripe-js";
import { Price } from "@/components/Price";
import { ProductImage } from "@/components/ProductImage";
import { CheckoutPaymentForm } from "@/components/checkout/CheckoutPaymentForm";
import { cartSelectors, useCartStore } from "@/lib/cart/cartStore";
import { HttpError } from "@/lib/http";
import { getOrCreateAnonId, trackCommerceEvent } from "@/lib/analytics";
import { isCheckoutEnabled } from "@/lib/env";
import { resolveStripePromise } from "@/lib/stripe";
import { addAddress, getCheckoutPrefill, getMe } from "@/services/auth";
import { applyDiscountCode } from "@/services/coupons";
import { createPaymentIntent, quoteShipping } from "@/services/orders";
import { listProducts } from "@/services/products";
import type { CreatePaymentIntentPayload, ShippingQuote } from "@/services/orders";
import type { CartItem } from "@/types";
import type { Address } from "@/types";
import styles from "./CheckoutClient.module.css";

type PaymentMethodChoice = "google_pay" | "card" | "boleto";
type CheckoutStep = "address" | "delivery" | "payment" | "review";
type CouponFeedbackTone = "" | "success" | "error";

type CheckoutFormState = {
  guestEmail: string;
  firstName: string;
  lastName: string;
  phoneDdd: string;
  phoneNumber: string;
  cpf: string;
  line1: string;
  line2: string;
  number: string;
  district: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  couponCode: string;
};


type RequiredCheckoutField =
  | "guestEmail"
  | "firstName"
  | "lastName"
  | "phoneDdd"
  | "phoneNumber"
  | "cpf"
  | "postalCode"
  | "line1"
  | "district"
  | "city"
  | "state"
  | "number";

type CheckoutFieldErrors = Partial<Record<RequiredCheckoutField, string>>;

type IntentSnapshot = {
  orderId: string;
  orderNumber: string;
  customerEmail: string;
  clientSecret: string;
  paymentMethodTypes: string[];
};

const INITIAL_FORM: CheckoutFormState = {
  guestEmail: "",
  firstName: "",
  lastName: "",
  phoneDdd: "",
  phoneNumber: "",
  cpf: "",
  line1: "",
  line2: "",
  number: "",
  district: "",
  city: "",
  state: "",
  postalCode: "",
  country: "BR",
  couponCode: "",
};


const REQUIRED_FIELDS: RequiredCheckoutField[] = [
  "guestEmail",
  "firstName",
  "lastName",
  "phoneDdd",
  "phoneNumber",
  "cpf",
  "postalCode",
];

const CHECKOUT_DRAFT_KEY = "checkout_address_draft_v1";

const INSTALLMENT_RULES: InstallmentRule[] = [
  { minCents: 50000, maxCents: 79999, installments: 3 },
  { minCents: 80000, maxCents: 109999, installments: 4 },
  { minCents: 110000, maxCents: 149999, installments: 5 },
  { minCents: 150000, maxCents: 199999, installments: 6 },
  { minCents: 200000, maxCents: 279999, installments: 7 },
  { minCents: 280000, maxCents: 379999, installments: 8 },
  { minCents: 380000, maxCents: 499999, installments: 9 },
  { minCents: 500000, maxCents: Number.MAX_SAFE_INTEGER, installments: 10 },
];

type AddressLike = {
  cep?: string;
  street?: string;
  number?: string;
  complement?: string;
  district?: string;
  city?: string;
  state?: string;
};

type ShippingRecommendation = "cheapest" | "fastest" | "balanced" | "free" | "today";

type CuratedShippingOptions = {
  quotes: ShippingQuote[];
  recommendationById: Record<string, ShippingRecommendation>;
  companyPaidByStore: boolean;
};

type InstallmentRule = {
  minCents: number;
  maxCents: number;
  installments: number;
};

class CheckoutValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CheckoutValidationError";
  }
}

function normalizePostalCode(value: string): string {
  return String(value || "").replace(/\D/g, "").slice(0, 8);
}

function normalizeDiscountCode(value: string): string {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, "")
    .slice(0, 40);
}

function normalizePhone(value: string): string {
  return String(value || "").replace(/\D/g, "").slice(0, 15);
}

function normalizePhoneDdd(value: string): string {
  return String(value || "").replace(/\D/g, "").slice(0, 2);
}

function normalizePhoneNumber(value: string): string {
  return String(value || "").replace(/\D/g, "").slice(0, 9);
}

function splitPhoneForCheckout(value: string): { ddd: string; number: string } {
  const digits = normalizePhone(value);
  if (digits.length >= 10) {
    return {
      ddd: normalizePhoneDdd(digits.slice(0, 2)),
      number: normalizePhoneNumber(digits.slice(2)),
    };
  }
  return {
    ddd: "",
    number: normalizePhoneNumber(digits),
  };
}

function normalizeCpf(value: string): string {
  return String(value || "").replace(/\D/g, "").slice(0, 11);
}

function normalizeState(value: string): string {
  return String(value || "").trim().toUpperCase().slice(0, 2);
}

function normalizeCountry(value: string): string {
  return String(value || "").trim().toUpperCase().slice(0, 2);
}

function normalizeEmail(value: string): string {
  return String(value || "").trim().toLowerCase();
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(value));
}

function formatCurrencyBrlFromCents(amountCents: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Math.max(0, Number(amountCents || 0)) / 100);
}

function resolveInstallmentsByTotal(totalCents: number): { installments: number; rule: InstallmentRule | null } {
  const safeTotal = Math.max(0, Math.floor(Number(totalCents || 0)));
  const matched = INSTALLMENT_RULES.find((rule) => safeTotal >= rule.minCents && safeTotal <= rule.maxCents) || null;
  if (!matched) return { installments: 1, rule: null };
  return { installments: matched.installments, rule: matched };
}

function formatCpf(value: string): string {
  const digits = normalizeCpf(value);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
  if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

function formatPostalCode(value: string): string {
  const digits = normalizePostalCode(value);
  if (digits.length <= 5) return digits;
  return `${digits.slice(0, 5)}-${digits.slice(5)}`;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || "").trim());
}

function normalizeAddressToken(value: string): string {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function addressFingerprint(payload: AddressLike): string {
  const cep = normalizePostalCode(String(payload.cep || ""));
  const street = normalizeAddressToken(String(payload.street || ""));
  const number = normalizeAddressToken(String(payload.number || ""));
  const complement = normalizeAddressToken(String(payload.complement || ""));
  const district = normalizeAddressToken(String(payload.district || ""));
  const city = normalizeAddressToken(String(payload.city || ""));
  const state = normalizeState(String(payload.state || ""));
  return [cep, street, number, complement, district, city, state].join("|");
}

function shippingDeadlineDaysValue(quote: ShippingQuote): number {
  if (String(quote?.serviceCode || "").trim().toLowerCase() === "company_emergency") return 0;
  const days = Number(quote?.deadlineDays ?? 0);
  if (!Number.isFinite(days) || days <= 0) return 999;
  return Math.max(1, Math.floor(days));
}

function shippingPriceCentsValue(quote: ShippingQuote): number {
  return Math.max(0, Number(quote?.priceCents || 0));
}

function isCompanyPaidShippingZip(value: string): boolean {
  const zip = normalizePostalCode(value);
  if (zip.length !== 8) return false;
  const prefix = Number(zip.slice(0, 5));
  if (!Number.isFinite(prefix)) return false;

  const isSaoPauloCapital = (prefix >= 1000 && prefix <= 5999) || (prefix >= 8000 && prefix <= 8499);
  const isOsasco = prefix >= 6000 && prefix <= 6299;
  return isSaoPauloCapital || isOsasco;
}

function compareByCheapest(a: ShippingQuote, b: ShippingQuote): number {
  return (
    shippingPriceCentsValue(a) - shippingPriceCentsValue(b) ||
    shippingDeadlineDaysValue(a) - shippingDeadlineDaysValue(b) ||
    String(a.serviceName || "").localeCompare(String(b.serviceName || ""))
  );
}

function compareByFastest(a: ShippingQuote, b: ShippingQuote): number {
  return (
    shippingDeadlineDaysValue(a) - shippingDeadlineDaysValue(b) ||
    shippingPriceCentsValue(a) - shippingPriceCentsValue(b) ||
    String(a.serviceName || "").localeCompare(String(b.serviceName || ""))
  );
}

function normalizeScore(value: number, min: number, max: number): number {
  if (!Number.isFinite(value) || !Number.isFinite(min) || !Number.isFinite(max)) return 0;
  const denominator = max - min;
  if (denominator <= 0) return 0;
  return (value - min) / denominator;
}

function shippingBestChoiceScore(
  quote: ShippingQuote,
  stats: { minPrice: number; maxPrice: number; minDays: number; maxDays: number }
): number {
  const priceNorm = normalizeScore(shippingPriceCentsValue(quote), stats.minPrice, stats.maxPrice);
  const daysNorm = normalizeScore(shippingDeadlineDaysValue(quote), stats.minDays, stats.maxDays);
  const average = (priceNorm + daysNorm) / 2;
  const balancePenalty = Math.abs(priceNorm - daysNorm) * 0.35;
  return average + balancePenalty;
}

function curateShippingOptions(destinationZip: string, rawQuotes: ShippingQuote[]): CuratedShippingOptions {
  const quotes = (Array.isArray(rawQuotes) ? rawQuotes : []).filter((quote) => shippingPriceCentsValue(quote) > 0);
  const recommendationById: Record<string, ShippingRecommendation> = {};
  if (quotes.length === 0) return { quotes: [], recommendationById, companyPaidByStore: false };

  const companyPaidByStore = isCompanyPaidShippingZip(destinationZip);
  if (companyPaidByStore) {
    const upToTwoDays = quotes.filter((quote) => shippingDeadlineDaysValue(quote) <= 2);
    const freeSource = upToTwoDays.length > 0 ? upToTwoDays : quotes;
    const freeOption = [...freeSource].sort(compareByCheapest)[0] || null;
    const todayOption: ShippingQuote = {
      id: "company_emergency",
      provider: "company",
      serviceCode: "company_emergency",
      serviceName: "Envio emergencial",
      priceCents: 5000,
      deadlineDays: 0,
      carrierName: "Entrega da empresa",
      destinationZip
    };

    const selected: ShippingQuote[] = [];
    if (freeOption) {
      selected.push(freeOption);
      recommendationById[freeOption.id] = "free";
    }
    selected.push(todayOption);
    recommendationById[todayOption.id] = "today";

    return { quotes: selected, recommendationById, companyPaidByStore };
  }

  const cheapest = [...quotes].sort(compareByCheapest)[0] || null;
  const fastest = [...quotes].sort(compareByFastest)[0] || null;
  const priceList = quotes.map((quote) => shippingPriceCentsValue(quote));
  const daysList = quotes.map((quote) => shippingDeadlineDaysValue(quote));
  const scoreStats = {
    minPrice: Math.min(...priceList),
    maxPrice: Math.max(...priceList),
    minDays: Math.min(...daysList),
    maxDays: Math.max(...daysList)
  };
  const selected: ShippingQuote[] = [];

  function addUnique(quote: ShippingQuote | null) {
    if (!quote) return;
    if (selected.some((entry) => entry.id === quote.id)) return;
    selected.push(quote);
  }

  addUnique(cheapest);
  addUnique(fastest);

  const bestChoice = [...quotes]
    .sort((a, b) => {
      return (
        shippingBestChoiceScore(a, scoreStats) - shippingBestChoiceScore(b, scoreStats) ||
        compareByCheapest(a, b)
      );
    })
    .find((quote) => !selected.some((entry) => entry.id === quote.id)) || null;
  addUnique(bestChoice);

  if (selected.length < 3) {
    const fallback = [...quotes].sort(compareByCheapest);
    fallback.forEach((quote) => {
      if (selected.length >= 3) return;
      addUnique(quote);
    });
  }

  if (selected[0]) recommendationById[selected[0].id] = "cheapest";
  if (selected[1]) recommendationById[selected[1].id] = recommendationById[selected[1].id] || "fastest";
  if (selected[2]) recommendationById[selected[2].id] = recommendationById[selected[2].id] || "balanced";

  return { quotes: selected.slice(0, 3), recommendationById, companyPaidByStore };
}

function shippingRecommendationLabel(tag?: ShippingRecommendation): string {
  if (tag === "free") return "Frete grÃ¡tis";
  if (tag === "today") return "Envio emergencial";
  if (tag === "cheapest") return "Mais barato";
  if (tag === "fastest") return "Mais rÃ¡pido";
  if (tag === "balanced") return "Melhor escolha.";
  return "";
}

function collectRequiredFieldErrors(
  form: CheckoutFormState,
  addressResolved: boolean,
  requiresGuestEmail: boolean
): CheckoutFieldErrors {
  const errors: CheckoutFieldErrors = {};
  if (requiresGuestEmail && !isValidEmail(form.guestEmail)) errors.guestEmail = "Email obrigatorio.";
  if (!String(form.firstName || "").trim()) errors.firstName = "Nome obrigatorio.";
  if (!String(form.lastName || "").trim()) errors.lastName = "Sobrenome obrigatorio.";
  if (normalizePhoneDdd(form.phoneDdd).length !== 2) errors.phoneDdd = "DDD obrigatorio.";
  if (normalizePhoneNumber(form.phoneNumber).length < 8) errors.phoneNumber = "Numero obrigatorio.";
  if (normalizeCpf(form.cpf).length !== 11) errors.cpf = "CPF obrigatorio.";
  if (!normalizePostalCode(form.postalCode)) errors.postalCode = "CEP obrigatorio.";
  if (!addressResolved) errors.postalCode = "Encontre o EndereÃ§o pelo CEP.";
  if (addressResolved) {
    if (!String(form.line1 || "").trim()) errors.line1 = "Rua obrigatoria.";
    if (!String(form.district || "").trim()) errors.district = "Bairro obrigatorio.";
    if (!String(form.city || "").trim()) errors.city = "Cidade obrigatoria.";
    if (!normalizeState(form.state)) errors.state = "UF obrigatoria.";
    if (!String(form.number || "").trim()) errors.number = "Numero obrigatorio.";
  }
  return errors;
}

function firstRequiredFieldError(errors: CheckoutFieldErrors): string | null {
  for (const field of REQUIRED_FIELDS) {
    const message = errors[field];
    if (message) return message;
  }
  const extraMessage = Object.values(errors).find(Boolean);
  if (extraMessage) return extraMessage;
  return null;
}

function mapDiscountCodeErrorMessage(raw: string): string {
  const normalized = String(raw || "").trim().toUpperCase();
  if (!normalized) return "";
  if (normalized.includes("INVALID_CODE")) return "Informe um codigo valido.";
  if (normalized.includes("CODE_NOT_FOUND")) return "Codigo nao encontrado.";
  if (normalized.includes("CODE_INACTIVE")) return "Codigo inativo.";
  if (normalized.includes("CODE_NOT_AVAILABLE_NOW")) return "Codigo fora do periodo de validade.";
  if (normalized.includes("CODE_NOT_APPLICABLE")) return "Codigo nao aplicavel para este carrinho.";
  return "";
}

function extractErrorTexts(error: unknown): string[] {
  const values: string[] = [];

  if (error instanceof HttpError) {
    const payload = error.payload && typeof error.payload === "object" ? (error.payload as { error?: unknown; message?: unknown }) : null;
    const payloadError = typeof payload?.error === "string" ? payload.error.trim() : "";
    const payloadMessage = typeof payload?.message === "string" ? payload.message.trim() : "";
    if (payloadError) values.push(payloadError);
    if (payloadMessage) values.push(payloadMessage);
    if (error.message) values.push(String(error.message).trim());
    return values.filter(Boolean);
  }

  if (error instanceof Error) {
    if (error.message) values.push(String(error.message).trim());
    return values.filter(Boolean);
  }

  if (typeof error === "string" && error.trim()) return [error.trim()];
  return values;
}

function resolveCheckoutErrorMessage(error: unknown, fallback: string): string {
  const candidates = extractErrorTexts(error);
  for (const candidate of candidates) {
    const mapped = mapDiscountCodeErrorMessage(candidate);
    if (mapped) return mapped;
  }
  return candidates.find(Boolean) || fallback;
}

function buildPayload(
  items: ReturnType<typeof cartSelectors.items>,
  form: CheckoutFormState,
  selectedShippingQuote: ShippingQuote,
  checkoutEmail: string,
  companyPaidByStore: boolean,
  installments: number,
  metaEventId: string,
  discountCode = ""
): CreatePaymentIntentPayload {
  const firstName = String(form.firstName || "").trim();
  const lastName = String(form.lastName || "").trim();
  const safeEmail = normalizeEmail(checkoutEmail);
  const phone = normalizePhone(`${normalizePhoneDdd(form.phoneDdd)}${normalizePhoneNumber(form.phoneNumber)}`);
  const postalCode = normalizePostalCode(form.postalCode);
  const state = normalizeState(form.state);
  const country = normalizeCountry(form.country) || "BR";

  const quotedShippingCents = Math.max(0, Number(selectedShippingQuote?.priceCents || 0));
  const shippingCents = companyPaidByStore ? 0 : quotedShippingCents;
  const deadlineDays = selectedShippingQuote?.deadlineDays == null ? null : Math.max(0, Number(selectedShippingQuote.deadlineDays || 0));
  const shippingEstimate = deadlineDays && deadlineDays > 0 ? `${deadlineDays} dias` : "";
  const selectedQuoteId = String(selectedShippingQuote?.id || "").trim();
  const shouldSendQuoteId = String(selectedShippingQuote?.provider || "").trim().toLowerCase() === "melhorenvio" && isUuid(selectedQuoteId);
  const payload: CreatePaymentIntentPayload = {
    paymentMethod: "automatic",
    installments: Math.max(1, Math.min(10, Number(installments || 1))),
    metaEventId: String(metaEventId || "").trim(),
    items: items.map((item) => ({
      id: item.productId,
      qty: item.qty,
      color: item.variant.color || null,
      size: item.variant.size || null,
      variantKey: item.variant.color && item.variant.size ? `${item.variant.color}__${item.variant.size}` : null,
    })),
    shipping: {
      firstName,
      lastName,
      fullName: [firstName, lastName].filter(Boolean).join(" ").trim(),
      email: safeEmail,
      phone,
      cep: postalCode,
      street: String(form.line1 || "").trim(),
      number: String(form.number || "").trim(),
      complement: String(form.line2 || "").trim(),
      district: String(form.district || "").trim(),
      city: String(form.city || "").trim(),
      state,
      shippingMethod: String(selectedShippingQuote?.serviceCode || "").trim().toLowerCase() || "standard",
      shippingCost: shippingCents / 100,
      shippingEstimate,
      quoteId: shouldSendQuoteId ? selectedQuoteId : null,
    },
    customer: {
      firstName,
      lastName,
      email: safeEmail,
      phone,
    },
    shippingAddress: {
      zip: postalCode,
      street: String(form.line1 || "").trim(),
      number: String(form.number || "").trim(),
      complement: String(form.line2 || "").trim(),
      district: String(form.district || "").trim(),
      city: String(form.city || "").trim(),
      state,
      country,
    },
  };

  const normalizedDiscountCode = normalizeDiscountCode(discountCode);
  if (normalizedDiscountCode) payload.discountCode = normalizedDiscountCode;

  return payload;
}

function buildStripePaymentMethodOrder(selectedMethod: PaymentMethodChoice): string[] {
  const selected = selectedMethod === "google_pay" ? "google_pay" : selectedMethod;
  const ordered = [selected];
  const unique: string[] = [];
  const seen = new Set<string>();
  ordered.forEach((method) => {
    const normalized = String(method || "").trim().toLowerCase();
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    unique.push(normalized);
  });
  return unique;
}

function buildCartItemMeta(item: CartItem): string {
  const parts = [item.variant.color, item.variant.size].filter(Boolean).map((entry) => String(entry || "").trim());
  parts.push(`Qtd ${Math.max(1, Number(item.qty || 1))}`);
  return parts.filter(Boolean).join(" Â· ");
}

export function CheckoutClient() {
  const checkoutEnabled = isCheckoutEnabled();
  const [stripePromise, setStripePromise] = useState<Promise<Stripe | null> | null>(null);
  const [stripeStatus, setStripeStatus] = useState<"loading" | "ready" | "missing">("loading");

  const hasHydrated = useCartStore(cartSelectors.hasHydrated);
  const items = useCartStore(cartSelectors.items);
  const subtotal = useCartStore(cartSelectors.subtotal);
  const currency = useCartStore(cartSelectors.currency) || "brl";
  const replaceCartItems = useCartStore((state) => state.replaceItems);

  const [form, setForm] = useState<CheckoutFormState>(INITIAL_FORM);
  const [activeStep, setActiveStep] = useState<CheckoutStep>("address");
  const [completed, setCompleted] = useState<Record<CheckoutStep, boolean>>({
    address: false,
    delivery: false,
    payment: false,
    review: false,
  });
  const [intent, setIntent] = useState<IntentSnapshot | null>(null);
  const [isCreatingIntent, setIsCreatingIntent] = useState(false);
  const [didAttemptAddressValidation, setDidAttemptAddressValidation] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [isAddressResolved, setIsAddressResolved] = useState(false);
  const [isFindingAddress, setIsFindingAddress] = useState(false);
  const [accountEmail, setAccountEmail] = useState("");
  const [accountAddresses, setAccountAddresses] = useState<Address[]>([]);
  const [selectedSavedAddressId, setSelectedSavedAddressId] = useState("");
  const [shippingQuotes, setShippingQuotes] = useState<ShippingQuote[]>([]);
  const [selectedShippingQuoteId, setSelectedShippingQuoteId] = useState("");
  const [shippingRecommendationById, setShippingRecommendationById] = useState<Record<string, ShippingRecommendation>>({});
  const [isCompanyPaidShipping, setIsCompanyPaidShipping] = useState(false);
  const [isLoadingShippingQuotes, setIsLoadingShippingQuotes] = useState(false);
  const [savedAddressFingerprints, setSavedAddressFingerprints] = useState<Set<string>>(new Set());
  const [isSavingAddress, setIsSavingAddress] = useState(false);
  const [isDraftLoaded, setIsDraftLoaded] = useState(false);
  const [hasAutoAttemptedIntent, setHasAutoAttemptedIntent] = useState(false);
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<PaymentMethodChoice>("card");
  const [selectedInstallments, setSelectedInstallments] = useState(1);
  const [discountCents, setDiscountCents] = useState(0);
  const [appliedCouponCode, setAppliedCouponCode] = useState("");
  const [couponFeedback, setCouponFeedback] = useState("");
  const [couponFeedbackTone, setCouponFeedbackTone] = useState<CouponFeedbackTone>("");
  const [isApplyingCoupon, setIsApplyingCoupon] = useState(false);
  const [paymentElementState, setPaymentElementState] = useState({ ready: false, complete: false });
  const [submitPaymentAction, setSubmitPaymentAction] = useState<null | (() => Promise<boolean>)>(null);
  const phoneNumberInputRef = useRef<HTMLInputElement | null>(null);
  const lastAutoLookupCepRef = useRef("");
  const couponPreviewKeyRef = useRef("");
  const imageBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || "";

  const [touchedFields, setTouchedFields] = useState<Partial<Record<RequiredCheckoutField, boolean>>>({});
  const requiresGuestEmail = !accountEmail;
  const checkoutEmail = normalizeEmail(accountEmail || form.guestEmail);

  const fieldErrors = useMemo(
    () => collectRequiredFieldErrors(form, isAddressResolved, requiresGuestEmail),
    [form, isAddressResolved, requiresGuestEmail]
  );
  const itemCount = useMemo(() => items.reduce((sum, item) => sum + Math.max(0, item.qty), 0), [items]);
  const selectedShippingQuote = useMemo(
    () =>
      shippingQuotes.find((quote) => quote.id === selectedShippingQuoteId) ||
      (shippingQuotes.length > 0 ? shippingQuotes[0] : null),
    [shippingQuotes, selectedShippingQuoteId]
  );
  const selectedShippingTag = selectedShippingQuote ? shippingRecommendationById[selectedShippingQuote.id] : undefined;
  const selectedCompanyPaidByStore = Boolean(isCompanyPaidShipping && selectedShippingTag === "free");
  const shippingCents = selectedCompanyPaidByStore ? 0 : Math.max(0, Number(selectedShippingQuote?.priceCents || 0));
  const totalCents = Math.max(0, subtotal + shippingCents - discountCents);
  const installmentPlan = useMemo(() => resolveInstallmentsByTotal(totalCents), [totalCents]);
  const stripePaymentMethodOrder = useMemo(
    () => buildStripePaymentMethodOrder(selectedPaymentMethod),
    [selectedPaymentMethod]
  );
  const installmentOptions = useMemo(() => {
    const maxInstallments = Math.max(1, Number(installmentPlan.installments || 1));
    return Array.from({ length: maxInstallments }, (_, index) => {
      const value = index + 1;
      const amountPerInstallment = formatCurrencyBrlFromCents(Math.ceil(totalCents / value));
      return {
        value,
        label: `${value}x de ${amountPerInstallment} sem juros`,
      };
    });
  }, [installmentPlan.installments, totalCents]);
  const visualCheckoutStep = useMemo<"delivery" | "payment" | "review">(() => {
    if (activeStep === "address" || activeStep === "delivery") return "delivery";
    if (activeStep === "review") return "review";
    return "payment";
  }, [activeStep]);
  const stripeConfigured = stripeStatus === "ready";
  const stripeLoading = stripeStatus === "loading";
  const hasTrackedBeginCheckoutRef = useRef(false);
  const beginCheckoutEventIdRef = useRef("");
  const getBeginCheckoutEventId = useCallback(() => {
    if (!beginCheckoutEventIdRef.current) {
      beginCheckoutEventIdRef.current = crypto.randomUUID();
    }
    return beginCheckoutEventIdRef.current;
  }, []);

  useEffect(() => {
    const maxInstallments = Math.max(1, Number(installmentPlan.installments || 1));
    setSelectedInstallments((current) => {
      if (current < 1 || current > maxInstallments) return maxInstallments;
      if (current === 1 && maxInstallments > 1) return maxInstallments;
      return current;
    });
  }, [installmentPlan.installments]);

  useEffect(() => {
    if (selectedPaymentMethod === "card") return;
    setSelectedInstallments(1);
  }, [selectedPaymentMethod]);

  useEffect(() => {
    const cep = normalizePostalCode(form.postalCode);
    if (activeStep !== "address") return;
    if (cep.length !== 8) return;
    if (isFindingAddress) return;
    if (isAddressResolved && shippingQuotes.length > 0) {
      lastAutoLookupCepRef.current = cep;
      return;
    }
    if (lastAutoLookupCepRef.current === cep) return;
    lastAutoLookupCepRef.current = cep;
    handleFindAddress().catch(() => {});
  }, [activeStep, form.postalCode, isAddressResolved, isFindingAddress, shippingQuotes.length]);

  useEffect(() => {
    if (hasTrackedBeginCheckoutRef.current) return;
    if (!hasHydrated || itemCount <= 0) return;
    hasTrackedBeginCheckoutRef.current = true;
    void trackCommerceEvent({
      eventName: "begin_checkout",
      eventId: getBeginCheckoutEventId(),
      anonId: getOrCreateAnonId(),
      productId: items
        .map((item) => String(item.productId || "").trim())
        .filter(Boolean)
        .slice(0, 3)
        .join(","),
      category: "",
      price: totalCents,
      currency,
      source: "checkout_page",
      attributes: {
        item_count: itemCount,
      },
      meta: {
        email: checkoutEmail,
      },
    });
  }, [currency, checkoutEmail, getBeginCheckoutEventId, hasHydrated, itemCount, items, totalCents]);

  useEffect(() => {
    let isMounted = true;
    const promise = resolveStripePromise();
    setStripePromise(promise);
    promise
      .then((instance) => {
        if (!isMounted) return;
        setStripeStatus(instance ? "ready" : "missing");
      })
      .catch(() => {
        if (!isMounted) return;
        setStripeStatus("missing");
      });

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    try {
      const raw = window.sessionStorage.getItem(CHECKOUT_DRAFT_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { form?: Partial<CheckoutFormState>; isAddressResolved?: boolean } | null;
      if (!parsed) return;
      const draftForm = parsed.form;
      if (draftForm) {
        setForm((current) => ({
          ...current,
          ...draftForm,
          guestEmail: normalizeEmail(String(draftForm.guestEmail || current.guestEmail || "")),
          postalCode: normalizePostalCode(String(draftForm.postalCode || current.postalCode || "")),
          cpf: normalizeCpf(String(draftForm.cpf || current.cpf || "")),
          phoneDdd: normalizePhoneDdd(String(draftForm.phoneDdd || current.phoneDdd || "")),
          phoneNumber: normalizePhoneNumber(String(draftForm.phoneNumber || current.phoneNumber || "")),
          state: normalizeState(String(draftForm.state || current.state || "")),
        }));
      }
      setIsAddressResolved(Boolean(parsed.isAddressResolved));
    } catch {
      // noop
    } finally {
      setIsDraftLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (!isDraftLoaded) return;
    try {
      window.sessionStorage.setItem(
        CHECKOUT_DRAFT_KEY,
        JSON.stringify({
          form,
          isAddressResolved,
        })
      );
    } catch {
      // noop
    }
  }, [form, isAddressResolved, isDraftLoaded]);

  useEffect(() => {
    let isMounted = true;

    async function loadAccountEmail() {
      try {
        const user = await getMe({ cache: "no-store" });
        if (!isMounted) return;
        if (!user) {
          setAccountEmail("");
          setAccountAddresses([]);
          setSelectedSavedAddressId("");
          setSavedAddressFingerprints(new Set());
          return;
        }

        const normalizedUserEmail = normalizeEmail(String(user?.email || ""));
        setAccountEmail(normalizedUserEmail);
        const userAddresses = Array.isArray(user?.addresses) ? user.addresses : [];
        setAccountAddresses(userAddresses);
        const defaultAddressId = String(user?.defaultAddressId || "").trim();
        const selectedAddressId =
          (defaultAddressId && userAddresses.some((address) => address.id === defaultAddressId) && defaultAddressId) ||
          userAddresses[0]?.id ||
          "";
        setSelectedSavedAddressId(selectedAddressId);
        if (normalizedUserEmail) {
          setForm((current) => ({ ...current, guestEmail: current.guestEmail || normalizedUserEmail }));
        }
        setSavedAddressFingerprints(
          new Set(userAddresses.map((address) => addressFingerprint({
            cep: address.cep,
            street: address.street,
            number: address.number,
            complement: address.complement,
            district: address.district,
            city: address.city,
            state: address.state,
          })))
        );

        let prefillPhone = "";
        let prefillCpf = "";
        let prefillFullName = "";

        try {
          const prefill = await getCheckoutPrefill({ cache: "no-store" });
          if (!isMounted) return;
          prefillPhone = normalizePhone(String(prefill?.phone || ""));
          prefillCpf = normalizeCpf(String(prefill?.cpf || ""));
          prefillFullName = String(prefill?.fullName || "").trim();
        } catch {
          // Fallback para dados bÃ¡sicos da conta quando o endpoint de prefill nÃ£o responder.
        }

        const accountPhone = normalizePhone(String((user as { phone?: string })?.phone || ""));
        const accountCpf = normalizeCpf(String(user?.cpf || ""));
        const accountName = String(user?.name || "").trim();
        const nameToUse = accountName || prefillFullName;
        const phoneToUse = accountPhone || prefillPhone;
        const cpfToUse = accountCpf || prefillCpf;
        const phoneParts = splitPhoneForCheckout(phoneToUse);

        setForm((current) => {
          const next = { ...current };
          if (!next.guestEmail && normalizedUserEmail) next.guestEmail = normalizedUserEmail;

          if (!next.firstName && nameToUse) {
            const parts = nameToUse.split(/\s+/).filter(Boolean);
            if (parts.length > 0) {
              next.firstName = parts[0] || "";
              if (!next.lastName) next.lastName = parts.slice(1).join(" ");
            }
          }

          if (!normalizeCpf(next.cpf) && cpfToUse) next.cpf = cpfToUse;
          if (!normalizePhoneDdd(next.phoneDdd) && phoneParts.ddd) next.phoneDdd = phoneParts.ddd;
          if (!normalizePhoneNumber(next.phoneNumber) && phoneParts.number) next.phoneNumber = phoneParts.number;

          return next;
        });
      } catch {
        if (!isMounted) return;
        setAccountEmail("");
        setAccountAddresses([]);
        setSelectedSavedAddressId("");
        setSavedAddressFingerprints(new Set());
      }
    }

    loadAccountEmail();
    return () => {
      isMounted = false;
    };
  }, []);

  const gateError = useMemo(() => {
    if (!checkoutEnabled) return "Checkout desativado no momento.";
    if (!hasHydrated) return "Carregando carrinho...";
    if (itemCount <= 0) return "Seu carrinho esta vazio.";
    if (stripeLoading) return "Carregando pagamento...";
    if (!stripeConfigured) return "Pagamento indisponivel.";
    return "";
  }, [checkoutEnabled, hasHydrated, itemCount, stripeConfigured, stripeLoading]);

  function assertCheckoutReady() {
    if (!checkoutEnabled) throw new CheckoutValidationError("Checkout desativado.");
    if (!hasHydrated) throw new CheckoutValidationError("Carrinho ainda carregando.");
    if (itemCount <= 0) throw new CheckoutValidationError("Carrinho vazio.");
    if (stripeLoading) throw new CheckoutValidationError("Pagamento ainda carregando.");
    if (!stripeConfigured) throw new CheckoutValidationError("Pagamento indisponivel.");
  }

  function invalidatePreparedPayment() {
    setIntent(null);
    setHasAutoAttemptedIntent(false);
    setPaymentElementState({ ready: false, complete: false });
    setSubmitPaymentAction(null);
    setCompleted((current) => ({ ...current, review: false }));
  }

  function clearAppliedCouponState({ clearFeedback = true }: { clearFeedback?: boolean } = {}) {
    couponPreviewKeyRef.current = "";
    setAppliedCouponCode("");
    setDiscountCents(0);
    if (clearFeedback) {
      setCouponFeedback("");
      setCouponFeedbackTone("");
    }
  }

  function handleInputChange(event: ChangeEvent<HTMLInputElement>) {
    const { name, value } = event.target;
    if (name === "couponCode" || name === "accessCode") {
      const nextCouponCode = normalizeDiscountCode(value);
      setForm((current) => ({ ...current, couponCode: nextCouponCode }));
      if (normalizeDiscountCode(appliedCouponCode) && nextCouponCode !== normalizeDiscountCode(appliedCouponCode)) {
        clearAppliedCouponState();
        invalidatePreparedPayment();
      } else {
        setCouponFeedback("");
        setCouponFeedbackTone("");
      }
      setErrorMessage("");
      return;
    }

    setForm((current) => {
      if (name === "postalCode") {
        return { ...current, postalCode: normalizePostalCode(value) };
      }
      if (name === "phoneDdd") {
        const nextDdd = normalizePhoneDdd(value);
        if (nextDdd.length === 2) {
          window.requestAnimationFrame(() => {
            phoneNumberInputRef.current?.focus();
          });
        }
        return { ...current, phoneDdd: nextDdd };
      }
      if (name === "phoneNumber") {
        return { ...current, phoneNumber: normalizePhoneNumber(value) };
      }
      if (name === "state") {
        return { ...current, state: normalizeState(value) };
      }
      if (name === "cpf") {
        return { ...current, cpf: normalizeCpf(value) };
      }
      if (name === "guestEmail") {
        return { ...current, guestEmail: normalizeEmail(value) };
      }
      return { ...current, [name]: value };
    });
    if (name === "postalCode") {
      setIsAddressResolved(false);
      setShippingQuotes([]);
      setSelectedShippingQuoteId("");
      setShippingRecommendationById({});
      setIsCompanyPaidShipping(false);
      markStepCompleted("delivery", false);
    }
    setErrorMessage("");
  }

  async function handleFindAddress() {
    const cep = normalizePostalCode(form.postalCode);
    if (cep.length !== 8) {
      setErrorMessage("Informe um CEP vÃ¡lido com 8 digitos.");
      setIsAddressResolved(false);
      return;
    }

    setIsFindingAddress(true);
    setErrorMessage("");

    try {
      const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`, { method: "GET", cache: "force-cache" });
      if (!response.ok) throw new Error("NÃ£o foi possÃ­vel consultar o CEP.");
      const payload = (await response.json()) as {
        erro?: boolean;
        logradouro?: string;
        bairro?: string;
        localidade?: string;
        uf?: string;
      };

      if (payload?.erro) throw new Error("CEP nÃ£o encontrado.");

      setForm((current) => ({
        ...current,
        line1: String(payload?.logradouro || "").trim(),
        district: String(payload?.bairro || "").trim(),
        city: String(payload?.localidade || "").trim(),
        state: normalizeState(String(payload?.uf || "").trim()),
      }));
      setIsAddressResolved(true);

      try {
        await loadShippingQuotes(cep);
      } catch (shippingError: unknown) {
        const shippingMessage =
          shippingError instanceof Error ? shippingError.message : "NÃ£o foi possÃ­vel carregar os fretes.";
        setErrorMessage(`EndereÃ§o encontrado. ${shippingMessage}`);
      }
    } catch (error: unknown) {
      setIsAddressResolved(false);
      const message = error instanceof Error ? error.message : "Erro ao encontrar EndereÃ§o.";
      setErrorMessage(message);
    } finally {
      setIsFindingAddress(false);
    }
  }

  async function handleApplyCoupon() {
    const code = normalizeDiscountCode(form.couponCode);
    if (!code) {
      clearAppliedCouponState({ clearFeedback: false });
      setCouponFeedback("Informe um codigo valido.");
      setCouponFeedbackTone("error");
      return;
    }

    setIsApplyingCoupon(true);
    setCouponFeedback("Validando codigo...");
    setCouponFeedbackTone("");

    try {
      const result = await applyDiscountCode(code, {
        subtotalCents: subtotal,
        shippingCents,
      });
      const resolvedCode = normalizeDiscountCode(String(result.code || code));
      couponPreviewKeyRef.current = `${resolvedCode}|${subtotal}|${shippingCents}`;
      setForm((current) => ({ ...current, couponCode: resolvedCode }));
      setAppliedCouponCode(resolvedCode);
      setDiscountCents(Math.max(0, Number(result.discountCents || 0)));
      setCouponFeedback("Codigo aplicado com sucesso.");
      setCouponFeedbackTone("success");
      invalidatePreparedPayment();
    } catch (error: unknown) {
      clearAppliedCouponState({ clearFeedback: false });
      setCouponFeedback(resolveCheckoutErrorMessage(error, "Nao foi possivel aplicar o codigo."));
      setCouponFeedbackTone("error");
      invalidatePreparedPayment();
    } finally {
      setIsApplyingCoupon(false);
    }
  }

  function handleRequiredFieldBlur(event: FocusEvent<HTMLInputElement>) {
    const name = event.target.name as RequiredCheckoutField;
    if (!REQUIRED_FIELDS.includes(name)) return;
    setTouchedFields((current) => ({ ...current, [name]: true }));
  }

  function showFieldError(field: RequiredCheckoutField): string {
    if (!didAttemptAddressValidation && !touchedFields[field]) return "";
    return fieldErrors[field] || "";
  }

  function markStepCompleted(step: CheckoutStep, value = true) {
    setCompleted((current) => ({ ...current, [step]: value }));
  }

  function formatShippingEstimate(quote: ShippingQuote | null): string {
    if (!quote) return "";
    if (String(quote.serviceCode || "").trim().toLowerCase() === "company_emergency") return "Chegara hoje";
    const days = quote.deadlineDays == null ? null : Math.max(0, Number(quote.deadlineDays || 0));
    if (!days || days <= 0) return "Prazo sob consulta";
    return days === 1 ? "Entrega estimada em 1 dia util" : `Entrega estimada em ${days} dias Ãºteis`;
  }

  async function loadShippingQuotes(destinationZipRaw: string): Promise<ShippingQuote[]> {
    const destinationZip = normalizePostalCode(destinationZipRaw);
    if (destinationZip.length !== 8) {
      setShippingQuotes([]);
      setSelectedShippingQuoteId("");
      setShippingRecommendationById({});
      setIsCompanyPaidShipping(false);
      return [];
    }

    setIsLoadingShippingQuotes(true);
    try {
      const result = await quoteShipping({ destinationZip });
      const allQuotes = Array.isArray(result?.data?.quotes) ? result.data.quotes : [];
      const curated = curateShippingOptions(destinationZip, allQuotes);
      const nextQuotes = curated.quotes;
      if (nextQuotes.length === 0) {
        setShippingQuotes([]);
        setSelectedShippingQuoteId("");
        setShippingRecommendationById({});
        setIsCompanyPaidShipping(false);
        throw new CheckoutValidationError("Nenhum frete disponivel para este CEP.");
      }
      setShippingQuotes(nextQuotes);
      setShippingRecommendationById(curated.recommendationById);
      setIsCompanyPaidShipping(curated.companyPaidByStore);
      setSelectedShippingQuoteId((current) => {
        if (current && nextQuotes.some((quote) => quote.id === current)) return current;
        return String(nextQuotes[0]?.id || "");
      });
      markStepCompleted("delivery", false);
      return nextQuotes;
    } catch (error: unknown) {
      if (isCompanyPaidShippingZip(destinationZip)) {
        const todayOption: ShippingQuote = {
          id: "company_emergency",
          provider: "company",
          serviceCode: "company_emergency",
          serviceName: "Envio emergencial",
          priceCents: 5000,
          deadlineDays: 0,
          carrierName: "Entrega da empresa",
          destinationZip
        };
        setShippingQuotes([todayOption]);
        setSelectedShippingQuoteId(todayOption.id);
        setShippingRecommendationById({ [todayOption.id]: "today" });
        setIsCompanyPaidShipping(true);
        markStepCompleted("delivery", false);
        return [todayOption];
      }
      setShippingQuotes([]);
      setSelectedShippingQuoteId("");
      setShippingRecommendationById({});
      setIsCompanyPaidShipping(false);
      throw error;
    } finally {
      setIsLoadingShippingQuotes(false);
    }
  }

  function handleUseSavedAddress() {
    const selected = accountAddresses.find((address) => address.id === selectedSavedAddressId);
    if (!selected) {
      setErrorMessage("Selecione um EndereÃ§o salvo.");
      return;
    }

    setForm((current) => ({
      ...current,
      postalCode: normalizePostalCode(selected.cep),
      line1: String(selected.street || "").trim(),
      number: String(selected.number || "").trim(),
      line2: String(selected.complement || "").trim(),
      district: String(selected.district || "").trim(),
      city: String(selected.city || "").trim(),
      state: normalizeState(String(selected.state || "").trim()),
    }));
    setIsAddressResolved(true);
    setErrorMessage("");
    loadShippingQuotes(selected.cep).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : "NÃ£o foi possÃ­vel carregar os fretes.";
      setErrorMessage(message);
    });
  }

  async function persistAddressOnAccountIfNew() {
    if (!accountEmail || !isAddressResolved) return;

    const fullName = [String(form.firstName || "").trim(), String(form.lastName || "").trim()].filter(Boolean).join(" ").trim();
    const nextFingerprint = addressFingerprint({
      cep: form.postalCode,
      street: form.line1,
      number: form.number,
      complement: form.line2,
      district: form.district,
      city: form.city,
      state: form.state,
    });

    const alreadyExistsInAccount = accountAddresses.some((address) =>
      addressFingerprint({
        cep: address.cep,
        street: address.street,
        number: address.number,
        complement: address.complement,
        district: address.district,
        city: address.city,
        state: address.state,
      }) === nextFingerprint
    );

    if (!nextFingerprint || savedAddressFingerprints.has(nextFingerprint) || alreadyExistsInAccount) {
      if (nextFingerprint && !savedAddressFingerprints.has(nextFingerprint)) {
        setSavedAddressFingerprints((current) => {
          const nextSet = new Set(current);
          nextSet.add(nextFingerprint);
          return nextSet;
        });
      }
      return;
    }

    setIsSavingAddress(true);
    try {
      const result = await addAddress({
        label: "EndereÃ§o principal",
        fullName: fullName || "Cliente TSEBI",
        cep: normalizePostalCode(form.postalCode),
        street: String(form.line1 || "").trim(),
        number: String(form.number || "").trim(),
        complement: String(form.line2 || "").trim() || undefined,
        district: String(form.district || "").trim(),
        city: String(form.city || "").trim(),
        state: normalizeState(form.state),
      });

      const nextSet = new Set(
        (result?.addresses || []).map((address) =>
          addressFingerprint({
            cep: address.cep,
            street: address.street,
            number: address.number,
            complement: address.complement,
            district: address.district,
            city: address.city,
            state: address.state,
          })
        )
      );
      nextSet.add(nextFingerprint);
      setSavedAddressFingerprints(nextSet);
    } catch {
      // NÃ£o bloqueia o checkout quando a sincronizaÃ§Ã£o da agenda falha.
      setSavedAddressFingerprints((current) => {
        const nextSet = new Set(current);
        nextSet.add(nextFingerprint);
        return nextSet;
      });
    } finally {
      setIsSavingAddress(false);
    }
  }

  async function handleAddressConfirm() {
    setDidAttemptAddressValidation(true);
    const validationError = firstRequiredFieldError(fieldErrors);
    if (validationError) {
      setErrorMessage(validationError);
      return;
    }
    if (isLoadingShippingQuotes) {
      setErrorMessage("Aguarde o carregamento dos fretes.");
      return;
    }

    let nextSelectedQuote = selectedShippingQuote;
    try {
      if (shippingQuotes.length === 0) {
        const nextQuotes = await loadShippingQuotes(form.postalCode);
        nextSelectedQuote = nextQuotes[0] || null;
      }
      if (!nextSelectedQuote) throw new CheckoutValidationError("Selecione um frete para continuar.");
      await persistAddressOnAccountIfNew();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "NÃ£o foi possÃ­vel confirmar o EndereÃ§o.";
      setErrorMessage(message);
      return;
    }

    setErrorMessage("");
    markStepCompleted("address", true);
    markStepCompleted("delivery", true);
    markStepCompleted("review", false);
    setActiveStep("payment");
  }

  async function ensurePaymentIntent(): Promise<boolean> {
    if (intent?.clientSecret) return true;

    setDidAttemptAddressValidation(true);
    const validationError = firstRequiredFieldError(fieldErrors);
    if (validationError) {
      setErrorMessage(validationError);
      setActiveStep("address");
      return false;
    }

    setIsCreatingIntent(true);
    setErrorMessage("");

    try {
      assertCheckoutReady();
      const syncedItems = await syncCartWithCatalog();
      if (syncedItems.length <= 0) {
        throw new CheckoutValidationError("Seu carrinho estÃ¡ vazio.");
      }
      if (!selectedShippingQuote) {
        throw new CheckoutValidationError("Selecione um frete para continuar.");
      }
      const payload = buildPayload(
        syncedItems,
        form,
        selectedShippingQuote,
        checkoutEmail,
        selectedCompanyPaidByStore,
        selectedInstallments,
        getBeginCheckoutEventId(),
        appliedCouponCode
      );
      const result = await createPaymentIntent(payload);
      const clientSecret = String(result.clientSecret || result.paymentIntentClientSecret || "").trim();

      if (!clientSecret) {
        throw new Error("Pagamento inicializado sem client secret.");
      }

      setIntent({
        orderId: String(result.orderId || "").trim(),
        orderNumber: String(result.orderNumber || "").trim(),
        customerEmail: String(result.customerEmail || checkoutEmail || "").trim(),
        clientSecret,
        paymentMethodTypes: Array.isArray(result.paymentMethodTypes)
          ? result.paymentMethodTypes.map((entry) => String(entry || "").trim().toLowerCase()).filter(Boolean)
          : [],
      });
      return true;
    } catch (error: unknown) {
      const message = resolveCheckoutErrorMessage(error, "Nao foi possivel iniciar pagamento.");
      setErrorMessage(message);
      return false;
    } finally {
      setIsCreatingIntent(false);
    }
  }

  useEffect(() => {
    const code = normalizeDiscountCode(appliedCouponCode);
    if (!code) return;

    const previewKey = `${code}|${subtotal}|${shippingCents}`;
    if (couponPreviewKeyRef.current === previewKey) return;

    let isActive = true;
    setIsApplyingCoupon(true);

    applyDiscountCode(code, {
      subtotalCents: subtotal,
      shippingCents,
    })
      .then((result) => {
        if (!isActive) return;
        couponPreviewKeyRef.current = previewKey;
        setAppliedCouponCode(normalizeDiscountCode(String(result.code || code)));
        setDiscountCents(Math.max(0, Number(result.discountCents || 0)));
        setCouponFeedback("Codigo aplicado com sucesso.");
        setCouponFeedbackTone("success");
        invalidatePreparedPayment();
      })
      .catch((error: unknown) => {
        if (!isActive) return;
        clearAppliedCouponState({ clearFeedback: false });
        setCouponFeedback(resolveCheckoutErrorMessage(error, "Nao foi possivel aplicar o codigo."));
        setCouponFeedbackTone("error");
        invalidatePreparedPayment();
      })
      .finally(() => {
        if (isActive) setIsApplyingCoupon(false);
      });

    return () => {
      isActive = false;
    };
  }, [appliedCouponCode, shippingCents, subtotal]);

  async function syncCartWithCatalog(): Promise<CartItem[]> {
    try {
      const catalog = await listProducts();
      const byId = new Map<string, (typeof catalog)[number]>();
      catalog.forEach((product) => {
        const id = String(product.id || "").trim();
        const sku = String(product.sku || "").trim();
        if (id) byId.set(id, product);
        if (sku) byId.set(sku, product);
      });

      let hasChanges = false;
      let removedOutOfStock = false;
      const nextItems: CartItem[] = [];

      items.forEach((item) => {
        const key = String(item.productId || "").trim();
        const product = byId.get(key);
        if (!product) {
          nextItems.push(item);
          return;
        }

        const stock = Math.max(0, Number(product.stock || 0));
        if (stock <= 0) {
          hasChanges = true;
          removedOutOfStock = true;
          return;
        }

        const nextUnitAmount = Math.max(0, Number(product.unitAmount || 0));
        const nextQty = Math.max(1, Math.min(Math.max(1, Number(item.qty || 1)), stock));

        if (nextUnitAmount !== Number(item.unitAmount || 0) || nextQty !== Number(item.qty || 0)) {
          hasChanges = true;
        }

        nextItems.push({
          ...item,
          unitAmount: nextUnitAmount,
          qty: nextQty,
        });
      });

      if (hasChanges) {
        replaceCartItems(nextItems, currency);
        const messages: string[] = ["Atualizamos seu carrinho com preÃ§o/estoque atuais."];
        if (removedOutOfStock) {
          messages.push("Alguns itens foram removidos por falta de estoque.");
        }
        setErrorMessage(messages.join(" "));
      }

      return nextItems;
    } catch {
      return items;
    }
  }

  async function handlePaymentConfirm() {
    if (!completed.address) {
      setActiveStep("address");
      setErrorMessage("Confirme o EndereÃ§o antes de pagar.");
      return;
    }
    if (!completed.delivery) {
      setActiveStep("address");
      setErrorMessage("Selecione e confirme o frete antes de pagar.");
      return;
    }

    markStepCompleted("payment", true);
    setHasAutoAttemptedIntent(true);
    const ok = await ensurePaymentIntent();
    if (!ok) return;
    if (!paymentElementState.ready || !paymentElementState.complete) {
      setErrorMessage("Preencha os dados de pagamento antes de revisar o pedido.");
      return;
    }
    markStepCompleted("review", true);
    setErrorMessage("");
    setActiveStep("review");
  }

  async function handleReviewSubmit() {
    if (!submitPaymentAction) {
      setErrorMessage("Volte para a etapa de pagamento e preencha os dados antes de confirmar.");
      setActiveStep("payment");
      return;
    }

    setErrorMessage("");
    await submitPaymentAction();
  }

  useEffect(() => {
    if (activeStep !== "payment") return;
    if (!completed.address || !completed.delivery) return;
    if (isCreatingIntent || intent?.clientSecret || hasAutoAttemptedIntent) return;
    setHasAutoAttemptedIntent(true);
    ensurePaymentIntent().catch(() => {});
  }, [activeStep, completed.address, completed.delivery, hasAutoAttemptedIntent, isCreatingIntent, intent?.clientSecret]);

  useEffect(() => {
    if (activeStep !== "payment") {
      setHasAutoAttemptedIntent(false);
      return;
    }
    if (!completed.address || !completed.delivery) {
      setHasAutoAttemptedIntent(false);
      return;
    }
    if (intent?.clientSecret) return;
  }, [activeStep, completed.address, completed.delivery, intent?.clientSecret]);

  const elementsOptions = useMemo(
    () => (intent ? { clientSecret: intent.clientSecret, appearance: { theme: "stripe" as const } } : undefined),
    [intent]
  );

  const addressDisplay = useMemo(() => {
    const postal = normalizePostalCode(form.postalCode);
    const postalFormatted = postal ? `${postal.slice(0, 5)}-${postal.slice(5)}` : "";
    return {
      name: [String(form.firstName || "").trim(), String(form.lastName || "").trim()].filter(Boolean).join(" ") || "CLIENTE TSEBI",
      line1: [form.line1, form.number].filter(Boolean).join(", "),
      line2: [form.city, form.state].filter(Boolean).join(", "),
      line3: [postalFormatted, form.country || "BRASIL"].filter(Boolean).join(" - "),
    };
  }, [form]);
  const reviewDeliveryLine = useMemo(() => {
    const city = String(form.city || "").trim();
    const state = normalizeState(form.state);
    const postal = formatPostalCode(form.postalCode);
    return [city, state, postal].filter(Boolean).join(" · ");
  }, [form.city, form.state, form.postalCode]);
  const selectedInstallmentLabel = useMemo(() => {
    return installmentOptions.find((option) => option.value === selectedInstallments)?.label || installmentOptions[0]?.label || "1x";
  }, [installmentOptions, selectedInstallments]);
  const reviewPaymentSummary = useMemo(() => {
    if (selectedPaymentMethod === "card") {
      return {
        line1: "Cartao de credito ••••",
        line2: selectedInstallmentLabel,
      };
    }
    if (selectedPaymentMethod === "boleto") {
      return {
        line1: "Boleto bancario",
        line2: "Pagamento a vista",
      };
    }
    return {
      line1: "Google Pay",
      line2: "Pagamento a vista",
    };
  }, [selectedInstallmentLabel, selectedPaymentMethod]);
  const billingFullName = useMemo(
    () => [String(form.firstName || "").trim(), String(form.lastName || "").trim()].filter(Boolean).join(" ").trim(),
    [form.firstName, form.lastName]
  );
  const boletoBillingAddress = useMemo(
    () => ({
      line1: [String(form.line1 || "").trim(), String(form.number || "").trim()].filter(Boolean).join(", "),
      city: String(form.city || "").trim(),
      state: normalizeState(form.state),
      postalCode: normalizePostalCode(form.postalCode),
      country: normalizeCountry(form.country) || "BR",
    }),
    [form.city, form.country, form.line1, form.number, form.postalCode, form.state]
  );

  if (gateError && !checkoutEnabled) {
    return (
      <section className={styles.maintenanceBox}>
        <h2>Checkout indisponivel</h2>
        <p>{gateError}</p>
      </section>
    );
  }

  return (
    <section className={styles.checkoutShell}>
      <div className={styles.checkoutGrid}>
        <div className={styles.leftColumn}>
          {errorMessage ? <p className={styles.errorBanner}>{errorMessage}</p> : null}

          <div className={styles.checkoutSteps}>
            <button
              type="button"
              className={`${styles.checkoutStep} ${visualCheckoutStep === "delivery" ? styles.checkoutStepActive : styles.checkoutStepDone}`}
              onClick={() => setActiveStep("address")}
            >
              Entrega
            </button>
            <button
              type="button"
              className={`${styles.checkoutStep} ${
                visualCheckoutStep === "payment" ? styles.checkoutStepActive : visualCheckoutStep === "review" ? styles.checkoutStepDone : ""
              }`}
              onClick={() => {
                if (completed.address && completed.delivery) setActiveStep("payment");
              }}
            >
              Pagamento
            </button>
            <button
              type="button"
              className={`${styles.checkoutStep} ${visualCheckoutStep === "review" ? styles.checkoutStepActive : ""}`}
              onClick={() => {
                if (completed.address && completed.delivery && intent?.clientSecret) setActiveStep("review");
              }}
            >
              Revisao
            </button>
          </div>

          {visualCheckoutStep === "delivery" ? (
            <section className={styles.stepSection}>
              <div className={styles.stepHeader}>
                <h2 className={styles.sectionTitle}>Endereco de entrega.</h2>
                {activeStep !== "address" ? (
                  <button type="button" className={styles.stepActionLink} onClick={() => setActiveStep("address")}>
                    Editar
                  </button>
                ) : null}
              </div>

              {activeStep === "address" ? (
                <div className={styles.addressFormWrap}>
                  <p className={styles.sectionSub}>Selecione seu endereco de entrega ou insira um novo.</p>
                  {accountAddresses.length > 0 ? (
                    <div className={styles.savedAddressBar}>
                      <label className={`${styles.field} ${styles.fieldFull}`}>
                        <span>Endereco salvo</span>
                        <select
                          value={selectedSavedAddressId}
                          onChange={(event) => setSelectedSavedAddressId(String(event.target.value || ""))}
                        >
                          {accountAddresses.map((address) => (
                            <option key={address.id} value={address.id}>
                              {`${String(address.label || "Endereco").trim() || "Endereco"} - ${String(address.street || "").trim()}, ${String(address.number || "").trim()} - ${String(address.city || "").trim()}`}
                            </option>
                          ))}
                        </select>
                      </label>
                      <button type="button" className={styles.secondaryAction} onClick={handleUseSavedAddress}>
                        Usar endereco salvo
                      </button>
                    </div>
                  ) : null}

                  <div className={styles.formGrid}>
                    <label className={styles.field}>
                      <span>Nome *</span>
                      <input
                        name="firstName"
                        type="text"
                        value={form.firstName}
                        onChange={handleInputChange}
                        onBlur={handleRequiredFieldBlur}
                        aria-invalid={Boolean(showFieldError("firstName"))}
                      />
                      {showFieldError("firstName") ? <small>{showFieldError("firstName")}</small> : null}
                    </label>

                    <label className={styles.field}>
                      <span>Sobrenome *</span>
                      <input
                        name="lastName"
                        type="text"
                        value={form.lastName}
                        onChange={handleInputChange}
                        onBlur={handleRequiredFieldBlur}
                        aria-invalid={Boolean(showFieldError("lastName"))}
                      />
                      {showFieldError("lastName") ? <small>{showFieldError("lastName")}</small> : null}
                    </label>

                    {requiresGuestEmail ? (
                      <label className={`${styles.field} ${styles.fieldFull}`}>
                        <span>Email *</span>
                        <input
                          name="guestEmail"
                          type="email"
                          value={form.guestEmail}
                          onChange={handleInputChange}
                          onBlur={handleRequiredFieldBlur}
                          aria-invalid={Boolean(showFieldError("guestEmail"))}
                        />
                        {showFieldError("guestEmail") ? <small>{showFieldError("guestEmail")}</small> : null}
                      </label>
                    ) : null}

                    <div className={`${styles.phoneInlineRow} ${styles.fieldFull}`}>
                      <label className={`${styles.field} ${styles.phoneDddField}`}>
                        <span>DDD *</span>
                        <input
                          className={styles.dddInput}
                          name="phoneDdd"
                          type="tel"
                          value={form.phoneDdd}
                          onChange={handleInputChange}
                          onBlur={handleRequiredFieldBlur}
                          aria-invalid={Boolean(showFieldError("phoneDdd"))}
                        />
                        {showFieldError("phoneDdd") ? <small>{showFieldError("phoneDdd")}</small> : null}
                      </label>

                      <label className={`${styles.field} ${styles.phoneNumberField}`}>
                        <span>Telefone *</span>
                        <input
                          name="phoneNumber"
                          type="tel"
                          ref={phoneNumberInputRef}
                          value={form.phoneNumber}
                          onChange={handleInputChange}
                          onBlur={handleRequiredFieldBlur}
                          aria-invalid={Boolean(showFieldError("phoneNumber"))}
                        />
                        {showFieldError("phoneNumber") ? <small>{showFieldError("phoneNumber")}</small> : null}
                      </label>
                    </div>

                    <label className={styles.field}>
                      <span>CPF *</span>
                      <input
                        name="cpf"
                        type="text"
                        value={formatCpf(form.cpf)}
                        onChange={handleInputChange}
                        onBlur={handleRequiredFieldBlur}
                        aria-invalid={Boolean(showFieldError("cpf"))}
                      />
                      {showFieldError("cpf") ? <small>{showFieldError("cpf")}</small> : null}
                    </label>

                    <label className={`${styles.field} ${styles.fieldFull}`}>
                      <span>CEP *</span>
                      <div className={styles.cepRow}>
                        <input
                          className={styles.cepInput}
                          name="postalCode"
                          type="text"
                          value={formatPostalCode(form.postalCode)}
                          onChange={handleInputChange}
                          onBlur={handleRequiredFieldBlur}
                          aria-invalid={Boolean(showFieldError("postalCode"))}
                        />
                        <button
                          type="button"
                          className={styles.cepButton}
                          onClick={handleFindAddress}
                          disabled={isFindingAddress}
                        >
                          {isFindingAddress ? "..." : "Buscar"}
                        </button>
                      </div>
                      {showFieldError("postalCode") ? <small>{showFieldError("postalCode")}</small> : null}
                    </label>

                    {isAddressResolved ? (
                      <>
                        <label className={`${styles.field} ${styles.fieldFull}`}>
                          <span>Rua *</span>
                          <input
                            name="line1"
                            type="text"
                            value={form.line1}
                            onChange={handleInputChange}
                            onBlur={handleRequiredFieldBlur}
                            aria-invalid={Boolean(showFieldError("line1"))}
                          />
                          {showFieldError("line1") ? <small>{showFieldError("line1")}</small> : null}
                        </label>

                        <label className={styles.field}>
                          <span>Bairro *</span>
                          <input
                            name="district"
                            type="text"
                            value={form.district}
                            onChange={handleInputChange}
                            onBlur={handleRequiredFieldBlur}
                            aria-invalid={Boolean(showFieldError("district"))}
                          />
                          {showFieldError("district") ? <small>{showFieldError("district")}</small> : null}
                        </label>

                        <label className={styles.field}>
                          <span>Cidade *</span>
                          <input
                            name="city"
                            type="text"
                            value={form.city}
                            onChange={handleInputChange}
                            onBlur={handleRequiredFieldBlur}
                            aria-invalid={Boolean(showFieldError("city"))}
                          />
                          {showFieldError("city") ? <small>{showFieldError("city")}</small> : null}
                        </label>

                        <label className={styles.field}>
                          <span>UF *</span>
                          <input
                            name="state"
                            type="text"
                            value={form.state}
                            onChange={handleInputChange}
                            onBlur={handleRequiredFieldBlur}
                            aria-invalid={Boolean(showFieldError("state"))}
                          />
                          {showFieldError("state") ? <small>{showFieldError("state")}</small> : null}
                        </label>

                        <label className={styles.field}>
                          <span>Numero *</span>
                          <input
                            name="number"
                            type="text"
                            value={form.number}
                            onChange={handleInputChange}
                            onBlur={handleRequiredFieldBlur}
                            aria-invalid={Boolean(showFieldError("number"))}
                          />
                          {showFieldError("number") ? <small>{showFieldError("number")}</small> : null}
                        </label>

                        <label className={styles.field}>
                          <span>Complemento</span>
                          <input name="line2" type="text" value={form.line2} onChange={handleInputChange} />
                        </label>
                      </>
                    ) : null}
                  </div>

                  {isAddressResolved ? (
                    <div className={styles.deliveryInlineSection}>
                      <p className={styles.deliveryInlineTitle}>Opcoes de entrega</p>
                      {isLoadingShippingQuotes ? <p className={styles.deliveryLoading}>Buscando opcoes de frete...</p> : null}
                      {!isLoadingShippingQuotes && shippingQuotes.length === 0 ? (
                        <p className={styles.stepHint}>Nenhum frete disponivel para este CEP.</p>
                      ) : null}
                      {shippingQuotes.map((quote) => {
                        const isSelected = quote.id === (selectedShippingQuote?.id || "");
                        const recommendation = shippingRecommendationLabel(shippingRecommendationById[quote.id]);
                        const companyTag = shippingRecommendationById[quote.id];
                        const isFreeCompanyOption = isCompanyPaidShipping && companyTag === "free";
                        const optionTitle =
                          isCompanyPaidShipping && (companyTag === "free" || companyTag === "today")
                            ? recommendation
                            : quote.serviceName || "Entrega";
                        return (
                          <button
                            key={quote.id}
                            type="button"
                            className={`${styles.deliveryCard} ${isSelected ? styles.deliveryCardSelected : ""}`}
                            onClick={() => setSelectedShippingQuoteId(quote.id)}
                          >
                            <div>
                              {!isCompanyPaidShipping && recommendation ? <p className={styles.deliveryBadge}>{recommendation}</p> : null}
                              <p className={styles.deliveryTitle}>{optionTitle}</p>
                              <p className={styles.deliveryDate}>{formatShippingEstimate(quote)}</p>
                              <p className={styles.deliveryMeta}>{quote.carrierName || quote.provider}</p>
                            </div>
                            {isFreeCompanyOption ? null : (
                              <Price amountCents={Math.max(0, Number(quote.priceCents || 0))} currency={currency} />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  ) : null}

                  <div className={styles.stepFooterAction}>
                    <button
                      type="button"
                      className={styles.primaryAction}
                      onClick={handleAddressConfirm}
                      disabled={isSavingAddress || isLoadingShippingQuotes}
                    >
                      {isSavingAddress ? "Salvando endereco..." : "Continuar para pagamento"}
                    </button>
                  </div>
                </div>
              ) : (
                <div className={styles.summaryContent}>
                  <p>{addressDisplay.name}</p>
                  <p>{addressDisplay.line1}</p>
                  <p>{addressDisplay.line2}</p>
                  <p>{addressDisplay.line3}</p>
                </div>
              )}
            </section>
          ) : null}

          {visualCheckoutStep === "payment" || visualCheckoutStep === "review" ? (
            <section className={styles.stepSection}>
              <div className={styles.stepHeader}>
                <h2 className={styles.sectionTitle}>Pagamento.</h2>
                {activeStep !== "payment" ? (
                  <button type="button" className={styles.stepActionLink} onClick={() => setActiveStep("payment")}>
                    Editar
                  </button>
                ) : null}
              </div>

              {activeStep === "payment" ? (
                <div className={styles.paymentWrap}>
                  <p className={styles.sectionSub}>Seus dados sao protegidos com criptografia.</p>

                  <div className={styles.paymentOptions}>
                    <button
                      type="button"
                      className={`${styles.paymentOption} ${selectedPaymentMethod === "card" ? styles.paymentOptionSelected : ""}`}
                      onClick={() => setSelectedPaymentMethod("card")}
                    >
                      <span className={styles.paymentOptionContent}>
                        <span className={styles.paymentOptionIcon} aria-hidden style={{ width: 22, height: 22 }}>
                          <svg viewBox="0 0 24 24" width="20" height="20" style={{ display: "block" }}>
                            <rect
                              x="3.5"
                              y="5.5"
                              width="17"
                              height="13"
                              rx="1.8"
                              fill="none"
                              stroke="#4f93bf"
                              strokeWidth="1.4"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                            <line x1="3.5" y1="10" x2="20.5" y2="10" stroke="#4f93bf" strokeWidth="1.4" strokeLinecap="round" />
                            <rect
                              x="6.4"
                              y="13"
                              width="4.2"
                              height="2.4"
                              rx="0.4"
                              fill="none"
                              stroke="#4f93bf"
                              strokeWidth="1.3"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        </span>
                        <span className={styles.paymentOptionLabel}>Cartao</span>
                      </span>
                    </button>
                    <button
                      type="button"
                      className={`${styles.paymentOption} ${selectedPaymentMethod === "boleto" ? styles.paymentOptionSelected : ""}`}
                      onClick={() => setSelectedPaymentMethod("boleto")}
                    >
                      <span className={styles.paymentOptionContent}>
                        <span className={styles.paymentOptionIcon} aria-hidden style={{ width: 22, height: 22 }}>
                          <svg viewBox="0 0 24 24" width="20" height="20" style={{ display: "block" }}>
                            <rect
                              x="6.5"
                              y="4.5"
                              width="11"
                              height="15"
                              rx="1.6"
                              fill="none"
                              stroke="#9e9890"
                              strokeWidth="1.3"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                            <line x1="9.2" y1="8" x2="9.2" y2="16" stroke="#9e9890" strokeWidth="1.2" strokeLinecap="round" />
                            <line x1="11.3" y1="8" x2="11.3" y2="16" stroke="#9e9890" strokeWidth="1.2" strokeLinecap="round" />
                            <line x1="13.4" y1="8" x2="13.4" y2="16" stroke="#9e9890" strokeWidth="1.2" strokeLinecap="round" />
                            <line x1="15.5" y1="8" x2="15.5" y2="16" stroke="#9e9890" strokeWidth="1.2" strokeLinecap="round" />
                          </svg>
                        </span>
                        <span className={styles.paymentOptionLabel}>Boleto</span>
                      </span>
                    </button>
                    <button
                      type="button"
                      className={`${styles.paymentOption} ${selectedPaymentMethod === "google_pay" ? styles.paymentOptionSelected : ""}`}
                      onClick={() => setSelectedPaymentMethod("google_pay")}
                    >
                      <span className={styles.paymentOptionContent}>
                        <span className={styles.paymentOptionIcon} aria-hidden style={{ width: 22, height: 22 }}>
                          <svg viewBox="0 0 18 18" width="18" height="18" style={{ display: "block" }}>
                            <path
                              style={{ fill: "#4285F4" }}
                              d="M17.64 9.2045c0-.638-.0573-1.2518-.1636-1.8409H9v3.4818h4.8436c-.2086 1.125-.8427 2.0782-1.7959 2.7164v2.2582h2.9086c1.7023-1.5668 2.6837-3.8741 2.6837-6.6155z"
                            />
                            <path
                              style={{ fill: "#34A853" }}
                              d="M9 18c2.43 0 4.4673-.8068 5.9564-2.18l-2.9086-2.2582c-.8068.54-1.8409.8591-3.0477.8591-2.3432 0-4.3282-1.5818-5.0364-3.7091H.9573v2.3318C2.4382 15.9832 5.4818 18 9 18z"
                            />
                            <path
                              style={{ fill: "#FBBC05" }}
                              d="M3.9636 10.7118c-.18-.54-.2836-1.1168-.2836-1.7118s.1036-1.1718.2836-1.7118V4.9564H.9573C.3477 6.1718 0 7.5491 0 9s.3477 2.8282.9573 4.0436l3.0063-2.3318z"
                            />
                            <path
                              style={{ fill: "#EA4335" }}
                              d="M9 3.5795c1.3214 0 2.5077.4541 3.4405 1.345l2.5814-2.5814C13.4632.8918 11.4264 0 9 0 5.4818 0 2.4382 2.0168.9573 4.9564l3.0063 2.3318C4.6718 5.1618 6.6568 3.5795 9 3.5795z"
                            />
                          </svg>
                        </span>
                        <span className={styles.paymentOptionLabel}>Google Pay</span>
                      </span>
                    </button>
                  </div>

                  {selectedPaymentMethod === "card" ? (
                    intent?.clientSecret && stripePromise ? (
                      <div className={styles.securePaymentBox}>
                        <Elements stripe={stripePromise} options={elementsOptions}>
                          <CheckoutPaymentForm
                            orderId={intent.orderId}
                            customerEmail={intent.customerEmail || checkoutEmail}
                            clientSecret={intent.clientSecret}
                            paymentMethodOrder={stripePaymentMethodOrder}
                            mode="card"
                            onElementStateChange={setPaymentElementState}
                            onSubmitActionChange={setSubmitPaymentAction}
                            showSubmitButton={false}
                          />
                        </Elements>
                      </div>
                    ) : null
                  ) : null}

                  {selectedPaymentMethod === "card" ? (
                    <>
                      <label className={`${styles.field} ${styles.fieldFull}`}>
                        <span>Parcelas</span>
                        <select
                          value={selectedInstallments}
                          onChange={(event) => setSelectedInstallments(Math.max(1, Number(event.target.value || 1)))}
                        >
                          {installmentOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </label>

                      <p className={styles.installmentNote}>
                        {installmentPlan.rule
                          ? `Para o total atual, voce pode pagar em ate ${installmentPlan.installments}x sem juros. `
                          : "Parcelamento sem juros disponivel a partir de R$ 500. "}
                        O numero maximo de parcelas varia conforme o valor total do pedido.
                      </p>
                    </>
                  ) : (
                    <div className={styles.paymentMethodInfo}>
                      {selectedPaymentMethod === "boleto" ? (
                        <>
                          <p className={styles.paymentMethodInfoTitle}>Boleto bancario</p>
                          <p className={styles.paymentMethodInfoText}>
                            Pagamento a vista. O boleto e gerado apos clicar em Revisar pedido, com vencimento de 1 dia util.
                          </p>
                        </>
                      ) : (
                        <>
                          <p className={styles.paymentMethodInfoTitle}>Google Pay</p>
                          <p className={styles.paymentMethodInfoText}>
                            Pagamento a vista pela carteira Google em dispositivos compativeis. A confirmacao ocorre na etapa final.
                          </p>
                        </>
                      )}
                    </div>
                  )}

                  {stripeLoading ? <p className={styles.stepHint}>Carregando metodos de pagamento...</p> : null}
                  {!stripeLoading && !stripeConfigured ? <p className={styles.stepHint}>Pagamento indisponivel no momento.</p> : null}

                </div>
              ) : (
                <div className={styles.summaryContent}>
                  <p>{reviewPaymentSummary.line1}</p>
                  <p>{reviewPaymentSummary.line2}</p>
                </div>
              )}

              {selectedPaymentMethod !== "card" && intent?.clientSecret && stripePromise ? (
                <div
                  className={
                    selectedPaymentMethod === "boleto"
                      ? styles.hiddenPaymentHost
                      : activeStep === "payment"
                        ? styles.securePaymentBox
                        : styles.hiddenPaymentHost
                  }
                  aria-hidden={selectedPaymentMethod === "boleto" || activeStep !== "payment"}
                >
                  <Elements stripe={stripePromise} options={elementsOptions}>
                    <CheckoutPaymentForm
                      orderId={intent.orderId}
                      customerEmail={intent.customerEmail || checkoutEmail}
                      clientSecret={intent.clientSecret}
                      paymentMethodOrder={stripePaymentMethodOrder}
                      mode={selectedPaymentMethod === "boleto" ? "boleto" : "payment"}
                      billingNameDefault={billingFullName}
                      billingTaxId={normalizeCpf(form.cpf)}
                      billingAddress={boletoBillingAddress}
                      onElementStateChange={setPaymentElementState}
                      onSubmitActionChange={setSubmitPaymentAction}
                      showSubmitButton={false}
                    />
                  </Elements>
                </div>
              ) : null}

              {activeStep === "payment" ? (
                <button
                  type="button"
                  className={`${styles.primaryAction} ${styles.paymentPrimaryAction}`}
                  onClick={handlePaymentConfirm}
                  disabled={isCreatingIntent || stripeLoading || !stripeConfigured || !intent?.clientSecret}
                >
                  {isCreatingIntent ? "Preparando pagamento..." : "Revisar pedido"}
                </button>
              ) : null}
            </section>
          ) : null}

          {visualCheckoutStep === "review" ? (
            <section className={styles.stepSection}>
              <h2 className={styles.sectionTitle}>Revisao.</h2>
              <p className={styles.sectionSub}>Confirme os dados antes de finalizar.</p>

              <article className={styles.reviewCard}>
                <div className={styles.reviewCardHeader}>
                  <p className={styles.reviewEyebrow}>ENTREGA</p>
                  <button
                    type="button"
                    className={styles.reviewEditLink}
                    onClick={() => {
                      markStepCompleted("review", false);
                      setActiveStep("address");
                    }}
                  >
                    Editar
                  </button>
                </div>
                <div className={styles.reviewCardBody}>
                  <p>{addressDisplay.name}</p>
                  <p>{addressDisplay.line1}</p>
                  <p>{reviewDeliveryLine}</p>
                </div>
              </article>

              {submitPaymentAction ? (
                <button type="button" className={styles.primaryAction} onClick={handleReviewSubmit}>
                  Confirmar pedido
                </button>
              ) : (
                <button
                  type="button"
                  className={`${styles.primaryAction} ${styles.reviewFallbackButton}`}
                  onClick={() => setActiveStep("payment")}
                  disabled={isCreatingIntent || stripeLoading || !stripeConfigured}
                >
                  {isCreatingIntent ? "Preparando pagamento..." : "Voltar para pagamento"}
                </button>
              )}

              <p className={styles.termsText}>
                Ao confirmar, voce concorda com os <a href="/aviso-legal">Termos e condicoes</a> e com a{" "}
                <a href="/politica-privacidade">Politica de Privacidade</a>.
              </p>
            </section>
          ) : null}
        </div>

        <aside className={styles.rightColumn}>
          <div className={styles.summaryPanel}>
            <p className={styles.summaryEyebrow}>SEU PEDIDO</p>
            <div className={styles.summaryItems}>
              {items.map((item) => (
                <article key={item.key} className={styles.summaryItem}>
                  <div className={styles.summaryItemThumb}>
                    <ProductImage
                      src={item.imageUrl || ""}
                      alt={item.name}
                      width={58}
                      height={74}
                      className={styles.summaryImage}
                      imageBaseUrl={imageBaseUrl}
                    />
                  </div>
                  <div className={styles.summaryItemContent}>
                    <p className={styles.summaryItemName}>{item.name}</p>
                    <p className={styles.summaryItemMeta}>{buildCartItemMeta(item)}</p>
                  </div>
                  <Price amountCents={item.unitAmount * item.qty} currency={item.currency} className={styles.summaryItemPrice} />
                </article>
              ))}
            </div>

            <div className={styles.summaryLines}>
              <div className={styles.summaryRow}>
                <span>Subtotal</span>
                <Price amountCents={subtotal} currency={currency} className={styles.summaryValue} />
              </div>
              <div className={styles.summaryRow}>
                <span>Entrega</span>
                {selectedCompanyPaidByStore ? (
                  <strong>Gratis</strong>
                ) : (
                  <Price amountCents={shippingCents} currency={currency} className={styles.summaryValue} />
                )}
              </div>
              {discountCents > 0 ? (
                <div className={styles.summaryRow}>
                  <span>Desconto</span>
                  <strong className={styles.summaryValue}>- {formatCurrencyBrlFromCents(discountCents)}</strong>
                </div>
              ) : null}
            </div>

            <label className={styles.couponField}>
              <span>Codigo exclusivo</span>
              <div className={styles.couponRow}>
                <input
                  id="checkout-access-code"
                  name="accessCode"
                  type="text"
                  inputMode="text"
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  data-form-type="other"
                  data-lpignore="true"
                  placeholder="Insira seu codigo"
                  value={form.couponCode}
                  onChange={handleInputChange}
                />
                <button type="button" onClick={handleApplyCoupon} disabled={isApplyingCoupon}>
                  {isApplyingCoupon ? "..." : "Aplicar"}
                </button>
              </div>
              {couponFeedback ? (
                <p
                  className={`${styles.couponFeedback} ${
                    couponFeedbackTone === "error"
                      ? styles.couponFeedbackError
                      : couponFeedbackTone === "success"
                        ? styles.couponFeedbackSuccess
                        : ""
                  }`}
                >
                  {couponFeedback}
                </p>
              ) : null}
            </label>

            <div className={`${styles.summaryRow} ${styles.summaryTotal}`}>
              <span>Total</span>
              <Price amountCents={totalCents} currency={currency} className={styles.summaryTotalValue} />
            </div>

            {isCreatingIntent ? <p className={styles.stepHint}>Preparando pagamento...</p> : null}
            {selectedCompanyPaidByStore ? <p className={styles.shippingSponsoredText}>Frete pago pela empresa para este CEP.</p> : null}
          </div>
        </aside>
      </div>
    </section>
  );
}
