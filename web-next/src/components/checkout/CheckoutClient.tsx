"use client";

import { ChangeEvent, FocusEvent, useEffect, useMemo, useRef, useState } from "react";
import { Elements } from "@stripe/react-stripe-js";
import { Price } from "@/components/Price";
import { CheckoutPaymentForm } from "@/components/checkout/CheckoutPaymentForm";
import { cartSelectors, useCartStore } from "@/lib/cart/cartStore";
import { isCheckoutEnabled } from "@/lib/env";
import { hasStripePublishableKey, stripePromise } from "@/lib/stripe";
import { addAddress, getMe } from "@/services/auth";
import { createPaymentIntent, quoteShipping } from "@/services/orders";
import type { CreatePaymentIntentPayload, ShippingQuote } from "@/services/orders";
import type { Address } from "@/types";
import styles from "./CheckoutClient.module.css";

type PaymentMethodChoice = "apple_pay" | "google_pay" | "card" | "boleto";
type CheckoutStep = "address" | "delivery" | "payment";

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

class CheckoutValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CheckoutValidationError";
  }
}

function normalizePostalCode(value: string): string {
  return String(value || "").replace(/\D/g, "").slice(0, 8);
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

function addressFingerprint(payload: AddressLike): string {
  const cep = normalizePostalCode(String(payload.cep || ""));
  const street = String(payload.street || "").trim().toLowerCase();
  const number = String(payload.number || "").trim().toLowerCase();
  const complement = String(payload.complement || "").trim().toLowerCase();
  const district = String(payload.district || "").trim().toLowerCase();
  const city = String(payload.city || "").trim().toLowerCase();
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
  if (tag === "free") return "Frete grátis";
  if (tag === "today") return "Envio emergencial";
  if (tag === "cheapest") return "Mais barato";
  if (tag === "fastest") return "Mais rápido";
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
  if (!addressResolved) errors.postalCode = "Encontre o Endereço pelo CEP.";
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

function buildPayload(
  items: ReturnType<typeof cartSelectors.items>,
  form: CheckoutFormState,
  selectedShippingQuote: ShippingQuote,
  checkoutEmail: string,
  companyPaidByStore: boolean
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
    installments: 1,
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

  const discountCode = String(form.couponCode || "").trim();
  if (discountCode) payload.discountCode = discountCode;

  return payload;
}

function buildStripePaymentMethodOrder(selectedMethod: PaymentMethodChoice): string[] {
  const base: string[] = ["apple_pay", "google_pay", "card", "boleto"];
  const ordered = [selectedMethod, ...base];
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

export function CheckoutClient() {
  const checkoutEnabled = isCheckoutEnabled();
  const stripeConfigured = hasStripePublishableKey();

  const hasHydrated = useCartStore(cartSelectors.hasHydrated);
  const items = useCartStore(cartSelectors.items);
  const subtotal = useCartStore(cartSelectors.subtotal);
  const currency = useCartStore(cartSelectors.currency) || "brl";

  const [form, setForm] = useState<CheckoutFormState>(INITIAL_FORM);
  const [activeStep, setActiveStep] = useState<CheckoutStep>("address");
  const [completed, setCompleted] = useState<Record<CheckoutStep, boolean>>({
    address: false,
    delivery: false,
    payment: false,
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
  const phoneNumberInputRef = useRef<HTMLInputElement | null>(null);

  const [touchedFields, setTouchedFields] = useState<Partial<Record<RequiredCheckoutField, boolean>>>({});
  const requiresGuestEmail = !accountEmail;
  const checkoutEmail = normalizeEmail(accountEmail || form.guestEmail);

  const fieldErrors = useMemo(
    () => collectRequiredFieldErrors(form, isAddressResolved, requiresGuestEmail),
    [form, isAddressResolved, requiresGuestEmail]
  );
  const itemCount = useMemo(() => items.reduce((sum, item) => sum + Math.max(0, item.qty), 0), [items]);
  const firstItem = items[0] || null;
  const selectedShippingQuote = useMemo(
    () =>
      shippingQuotes.find((quote) => quote.id === selectedShippingQuoteId) ||
      (shippingQuotes.length > 0 ? shippingQuotes[0] : null),
    [shippingQuotes, selectedShippingQuoteId]
  );
  const selectedShippingTag = selectedShippingQuote ? shippingRecommendationById[selectedShippingQuote.id] : undefined;
  const selectedCompanyPaidByStore = Boolean(isCompanyPaidShipping && selectedShippingTag === "free");
  const shippingCents = selectedCompanyPaidByStore ? 0 : Math.max(0, Number(selectedShippingQuote?.priceCents || 0));
  const totalCents = Math.max(0, subtotal + shippingCents);
  const stripePaymentMethodOrder = useMemo(() => buildStripePaymentMethodOrder("apple_pay"), []);

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

        if (user?.name) {
          const parts = String(user.name || "").trim().split(/\s+/).filter(Boolean);
          if (parts.length > 0) {
            setForm((current) => ({
              ...current,
              firstName: current.firstName || parts[0] || "",
              lastName: current.lastName || parts.slice(1).join(" "),
            }));
          }
        }
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
    if (!stripeConfigured) return "Stripe não configurado.";
    return "";
  }, [checkoutEnabled, hasHydrated, itemCount, stripeConfigured]);

  function assertCheckoutReady() {
    if (!checkoutEnabled) throw new CheckoutValidationError("Checkout desativado.");
    if (!hasHydrated) throw new CheckoutValidationError("Carrinho ainda carregando.");
    if (itemCount <= 0) throw new CheckoutValidationError("Carrinho vazio.");
    if (!stripeConfigured) throw new CheckoutValidationError("Stripe não configurado.");
  }

  function handleInputChange(event: ChangeEvent<HTMLInputElement>) {
    const { name, value } = event.target;
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
      setErrorMessage("Informe um CEP válido com 8 digitos.");
      setIsAddressResolved(false);
      return;
    }

    setIsFindingAddress(true);
    setErrorMessage("");

    try {
      const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`, { method: "GET", cache: "no-store" });
      if (!response.ok) throw new Error("Não foi possível consultar o CEP.");
      const payload = (await response.json()) as {
        erro?: boolean;
        logradouro?: string;
        bairro?: string;
        localidade?: string;
        uf?: string;
      };

      if (payload?.erro) throw new Error("CEP não encontrado.");

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
          shippingError instanceof Error ? shippingError.message : "Não foi possível carregar os fretes.";
        setErrorMessage(`Endereço encontrado. ${shippingMessage}`);
      }
    } catch (error: unknown) {
      setIsAddressResolved(false);
      const message = error instanceof Error ? error.message : "Erro ao encontrar Endereço.";
      setErrorMessage(message);
    } finally {
      setIsFindingAddress(false);
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
    return days === 1 ? "Entrega estimada em 1 dia util" : `Entrega estimada em ${days} dias úteis`;
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
      setErrorMessage("Selecione um Endereço salvo.");
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
      const message = error instanceof Error ? error.message : "Não foi possível carregar os fretes.";
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

    if (!nextFingerprint || savedAddressFingerprints.has(nextFingerprint)) return;

    setIsSavingAddress(true);
    try {
      const result = await addAddress({
        label: "Endereço principal",
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
      throw new CheckoutValidationError("Não foi possível salvar o Endereço na sua conta.");
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

    try {
      if (shippingQuotes.length === 0) {
        await loadShippingQuotes(form.postalCode);
      }
      await persistAddressOnAccountIfNew();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Não foi possível confirmar o Endereço.";
      setErrorMessage(message);
      return;
    }

    setErrorMessage("");
    markStepCompleted("address", true);
    setActiveStep("delivery");
  }

  function handleDeliveryConfirm() {
    if (!completed.address) {
      setActiveStep("address");
      setErrorMessage("Confirme o Endereço primeiro.");
      return;
    }
    if (isLoadingShippingQuotes) {
      setErrorMessage("Aguarde o carregamento dos fretes.");
      return;
    }
    if (!selectedShippingQuote) {
      setErrorMessage("Selecione um frete para continuar.");
      return;
    }
    setErrorMessage("");
    markStepCompleted("delivery", true);
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
      if (!selectedShippingQuote) {
        throw new CheckoutValidationError("Selecione um frete para continuar.");
      }
      const payload = buildPayload(
        items,
        form,
        selectedShippingQuote,
        checkoutEmail,
        selectedCompanyPaidByStore
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
      const message = error instanceof Error ? error.message : "Não foi possível iniciar pagamento.";
      setErrorMessage(message);
      return false;
    } finally {
      setIsCreatingIntent(false);
    }
  }

  async function handlePaymentConfirm() {
    if (!completed.address) {
      setActiveStep("address");
      setErrorMessage("Confirme o Endereço antes de pagar.");
      return;
    }
    if (!completed.delivery) {
      setActiveStep("delivery");
      setErrorMessage("Confirme o método de entrega antes de pagar.");
      return;
    }

    markStepCompleted("payment", true);
    const ok = await ensurePaymentIntent();
    if (!ok) return;
    setActiveStep("payment");
  }

  useEffect(() => {
    if (activeStep !== "payment") return;
    if (!completed.address || !completed.delivery) return;
    if (isCreatingIntent || intent?.clientSecret) return;
    ensurePaymentIntent().catch(() => {});
  }, [activeStep, completed.address, completed.delivery, isCreatingIntent, intent?.clientSecret]);

  async function handleSummaryPay() {
    await handlePaymentConfirm();
    const secureBox = document.getElementById("checkout-secure-payment");
    if (secureBox) secureBox.scrollIntoView({ behavior: "smooth", block: "start" });
  }

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

          <section className={styles.stepSection}>
            <div className={styles.stepHeader}>
              <h2>Endereço de entrega</h2>
              {activeStep !== "address" ? (
                <button type="button" className={styles.stepActionLink} onClick={() => setActiveStep("address")}>
                  Editar
                </button>
              ) : null}
            </div>

            {activeStep === "address" ? (
              <div className={styles.addressFormWrap}>
                <p className={styles.stepHint}>Selecione seu Endereço de entrega ou insira um novo.</p>
                {accountAddresses.length > 0 ? (
                  <div className={styles.savedAddressBar}>
                    <label className={styles.savedAddressField}>
                      <span>Endereço salvo</span>
                      <select
                        value={selectedSavedAddressId}
                        onChange={(event) => setSelectedSavedAddressId(String(event.target.value || ""))}
                      >
                        {accountAddresses.map((address) => (
                          <option key={address.id} value={address.id}>
                            {`${String(address.label || "Endereço").trim() || "Endereço"} - ${String(address.street || "").trim()}, ${String(address.number || "").trim()} - ${String(address.city || "").trim()}`}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button type="button" className={styles.secondaryAction} onClick={handleUseSavedAddress}>
                      Usar Endereço salvo
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
                      <span>Numero de telefone *</span>
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
                    <span>Numero do CPF *</span>
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
                    <div className={styles.inlineActionRow}>
                      <input
                        className={styles.inlineActionInput}
                        name="postalCode"
                        type="text"
                        value={formatPostalCode(form.postalCode)}
                        onChange={handleInputChange}
                        onBlur={handleRequiredFieldBlur}
                        aria-invalid={Boolean(showFieldError("postalCode"))}
                      />
                      <button
                        type="button"
                        className={styles.secondaryAction}
                        onClick={handleFindAddress}
                        disabled={isFindingAddress}
                      >
                        {isFindingAddress ? "Buscando..." : "Encontrar Endereço"}
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

                <div className={styles.stepFooterAction}>
                  <button type="button" className={styles.primaryAction} onClick={handleAddressConfirm} disabled={isSavingAddress}>
                    {isSavingAddress ? "Salvando Endereço..." : "Confirmar Endereço de entrega"}
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

          <section className={styles.stepSection}>
            <div className={styles.stepHeader}>
              <h2>método de entrega</h2>
              {activeStep !== "delivery" ? (
                <button type="button" className={styles.stepActionLink} onClick={() => setActiveStep("delivery")}>
                  Editar
                </button>
              ) : completed.delivery ? (
                <button type="button" className={styles.stepActionLink} onClick={() => setActiveStep("payment")}>
                  Cancelar
                </button>
              ) : null}
            </div>

            {activeStep === "delivery" ? (
              <div className={styles.deliveryWrap}>
                {isLoadingShippingQuotes ? <p className={styles.deliveryLoading}>Buscando opcoes de frete...</p> : null}
                {shippingQuotes.map((quote) => {
                  const isSelected = quote.id === (selectedShippingQuote?.id || "");
                  const recommendation = shippingRecommendationLabel(shippingRecommendationById[quote.id]);
                  const companyTag = shippingRecommendationById[quote.id];
                  const isFreeCompanyOption = isCompanyPaidShipping && companyTag === "free";
                  const optionTitle = isCompanyPaidShipping && (companyTag === "free" || companyTag === "today")
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
                      {isFreeCompanyOption ? null : <Price amountCents={Math.max(0, Number(quote.priceCents || 0))} currency={currency} />}
                    </button>
                  );
                })}
                <div className={styles.stepFooterAction}>
                  <button
                    type="button"
                    className={styles.primaryAction}
                    onClick={handleDeliveryConfirm}
                    disabled={isLoadingShippingQuotes || !selectedShippingQuote}
                  >
                    Confirmar método de entrega
                  </button>
                </div>
              </div>
            ) : (
              <div className={styles.summaryContent}>
                <p>
                  {selectedShippingQuote?.serviceName || "Entrega"}{" "}
                  {selectedCompanyPaidByStore ? "(Frete por conta da empresa)" : <> (Total <Price amountCents={shippingCents} currency={currency} />)</>}
                </p>
                <p>{formatShippingEstimate(selectedShippingQuote)}</p>
              </div>
            )}
          </section>

          <section className={styles.stepSection}>
            <div className={styles.stepHeader}>
              <h2>Pagamento</h2>
              {activeStep !== "payment" ? (
                <button type="button" className={styles.stepActionLink} onClick={() => setActiveStep("payment")}>
                  Editar
                </button>
              ) : null}
            </div>

            {activeStep === "payment" ? (
              <div className={styles.paymentWrap}>
                <p className={styles.stepHint}>Pagamento seguro com Stripe</p>
                {!stripeConfigured ? <p className={styles.stepHint}>Stripe indisponivel no frontend (NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY).</p> : null}

                <div className={styles.stepFooterAction}>
                  <button type="button" className={styles.primaryAction} onClick={handlePaymentConfirm} disabled={isCreatingIntent}>
                    {isCreatingIntent ? "Preparando pagamento..." : "Confirmar forma de pagamento"}
                  </button>
                </div>

                {intent?.clientSecret ? (
                  <div id="checkout-secure-payment" className={styles.securePaymentBox}>
                    <h3>Confirmacao segura</h3>
                    <p>Finalize seu pagamento com Stripe.</p>
                    <Elements stripe={stripePromise} options={elementsOptions}>
                      <CheckoutPaymentForm
                        orderId={intent.orderId}
                        customerEmail={intent.customerEmail || checkoutEmail}
                        paymentMethodOrder={stripePaymentMethodOrder}
                        submitLabel="Pagar com Stripe"
                      />
                    </Elements>
                  </div>
                ) : null}
              </div>
            ) : (
              <div className={styles.summaryContent}>
                <p>Pagamento via Stripe</p>
              </div>
            )}
          </section>
        </div>

        <aside className={styles.rightColumn}>
          <div className={styles.summaryPanel}>
            <h3>Resumo</h3>
            <div className={styles.summaryRow}>
              <span>{firstItem?.name || "Item"}</span>
              <Price amountCents={subtotal} currency={currency} />
            </div>
            <div className={styles.summaryRow}>
              <span>Entrega</span>
              {selectedCompanyPaidByStore ? <span className={styles.shippingSponsoredText}>Por conta da empresa</span> : <Price amountCents={shippingCents} currency={currency} />}
            </div>

            <label className={styles.promoField}>
              <span>Código Exclusivo</span>
              <input name="couponCode" type="text" placeholder="Insira o Código exclusivo" value={form.couponCode} onChange={handleInputChange} />
            </label>

            <div className={`${styles.summaryRow} ${styles.summaryTotal}`}>
              <span>Total</span>
              <Price amountCents={totalCents} currency={currency} />
            </div>
            <p className={styles.termsText}>
              Ao fazer seu pedido, Você concorda com nossos Termos e condições e Política de Privacidade.
            </p>
            <button type="button" className={styles.productReplicaButton} onClick={handleSummaryPay} disabled={isCreatingIntent}>
              {isCreatingIntent ? "Preparando pagamento..." : "Pagar com Stripe"}
            </button>
          </div>
        </aside>
      </div>
    </section>
  );
}

