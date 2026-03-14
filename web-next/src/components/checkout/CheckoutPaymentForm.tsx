"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CardCvcElement, CardExpiryElement, CardNumberElement, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import type { StripeCardCvcElementChangeEvent, StripeCardExpiryElementChangeEvent, StripeCardNumberElementChangeEvent, StripePaymentElementChangeEvent } from "@stripe/stripe-js";
import { useCartStore } from "@/lib/cart/cartStore";
import styles from "./CheckoutPaymentForm.module.css";

type CheckoutPaymentFormProps = {
  orderId: string;
  customerEmail: string;
  clientSecret: string;
  paymentMethodOrder?: string[];
  mode?: "card" | "payment" | "boleto";
  billingNameDefault?: string;
  billingTaxId?: string;
  billingAddress?: {
    line1: string;
    city: string;
    state: string;
    postalCode: string;
    country?: string;
  };
  submitLabel?: string;
  onElementStateChange?: (state: { ready: boolean; complete: boolean }) => void;
  onSubmitActionChange?: (action: { fn: () => Promise<boolean> } | null) => void;
  showSubmitButton?: boolean;
};

type ConfirmationStatus = "success" | "failed" | "processing";

function buildConfirmationPath(
  status: ConfirmationStatus,
  orderId: string,
  customerEmail: string,
  errorMessage = ""
): string {
  const params = new URLSearchParams();
  params.set("status", status);
  if (status === "success") {
    const safeOrderId = String(orderId || "").trim();
    const safeEmail = String(customerEmail || "").trim().toLowerCase();
    if (safeOrderId) params.set("orderId", safeOrderId);
    if (safeEmail) params.set("email", safeEmail);
  } else if (status === "failed") {
    const safeError = String(errorMessage || "").trim();
    if (safeError) params.set("error", safeError);
  }
  return `/checkout/confirmation?${params.toString()}`;
}

function buildSuccessUrl(successPath: string): string {
  const siteUrl = String(process.env.NEXT_PUBLIC_SITE_URL || "").trim();
  const baseUrl = siteUrl ? siteUrl.replace(/\/+$/, "") : window.location.origin;
  return `${baseUrl}${successPath}`;
}

export function CheckoutPaymentForm({
  orderId,
  customerEmail,
  clientSecret,
  paymentMethodOrder = [],
  mode = "payment",
  billingNameDefault = "",
  billingTaxId = "",
  billingAddress,
  submitLabel,
  onElementStateChange,
  onSubmitActionChange,
  showSubmitButton = true
}: CheckoutPaymentFormProps) {
  const router = useRouter();
  const clearCart = useCartStore((state) => state.clear);
  const stripe = useStripe();
  const elements = useElements();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [paymentElementReady, setPaymentElementReady] = useState(false);
  const [paymentElementComplete, setPaymentElementComplete] = useState(false);
  const [billingName, setBillingName] = useState("");
  const [cardNumberReady, setCardNumberReady] = useState(false);
  const [cardExpiryReady, setCardExpiryReady] = useState(false);
  const [cardCvcReady, setCardCvcReady] = useState(false);
  const [cardNumberComplete, setCardNumberComplete] = useState(false);
  const [cardExpiryComplete, setCardExpiryComplete] = useState(false);
  const [cardCvcComplete, setCardCvcComplete] = useState(false);
  const paymentElementContainerRef = useRef<HTMLDivElement | null>(null);
  const previousCompleteRef = useRef<boolean | null>(null);
  const submitPaymentRef = useRef<() => Promise<boolean>>(async () => false);
  const isCardMode = mode === "card";
  const isBoletoMode = mode === "boleto";
  const normalizedPaymentMethodOrder = useMemo(
    () => (Array.isArray(paymentMethodOrder) ? paymentMethodOrder.filter(Boolean) : []),
    [paymentMethodOrder]
  );

  const successPath = useMemo(() => buildConfirmationPath("success", orderId, customerEmail), [orderId, customerEmail]);
  const processingPath = useMemo(() => buildConfirmationPath("processing", orderId, customerEmail), [orderId, customerEmail]);
  const successUrl = useMemo(() => buildSuccessUrl(successPath), [successPath]);
  const paymentElementOptions = useMemo(
    () => ({
      layout:
        normalizedPaymentMethodOrder.length === 1 && normalizedPaymentMethodOrder[0] === "google_pay"
          ? ({
              type: "accordion" as const,
              defaultCollapsed: false,
              radios: false,
              spacedAccordionItems: false,
            })
          : ("tabs" as const),
      wallets: {
        applePay: normalizedPaymentMethodOrder.includes("apple_pay") ? ("auto" as const) : ("never" as const),
        googlePay: normalizedPaymentMethodOrder.includes("google_pay") ? ("auto" as const) : ("never" as const),
      },
      paymentMethodOrder: normalizedPaymentMethodOrder
    }),
    [normalizedPaymentMethodOrder]
  );
  const sharedCardElementStyle = useMemo(
    () => ({
      base: {
        color: "#111111",
        fontFamily: "Jost, sans-serif",
        fontSize: "13px",
        fontWeight: "300",
        letterSpacing: "0.08em",
        "::placeholder": {
          color: "#c8c4bc",
        },
      },
      invalid: {
        color: "#9d1f1f",
      },
    }),
    []
  );
  const cardNumberOptions = useMemo(
    () => ({
      style: sharedCardElementStyle,
      placeholder: "0000 0000 0000 0000",
      showIcon: false,
    }),
    [sharedCardElementStyle]
  );
  const cardExpiryOptions = useMemo(
    () => ({
      style: sharedCardElementStyle,
      placeholder: "MM / AA",
    }),
    [sharedCardElementStyle]
  );
  const cardCvcOptions = useMemo(
    () => ({
      style: sharedCardElementStyle,
      placeholder: "...",
    }),
    [sharedCardElementStyle]
  );
  const paymentReady = isCardMode
    ? cardNumberReady && cardExpiryReady && cardCvcReady && Boolean(stripe) && Boolean(elements)
    : isBoletoMode
      ? Boolean(stripe)
      : paymentElementReady && Boolean(stripe) && Boolean(elements);
  const paymentComplete = isCardMode
    ? cardNumberComplete && cardExpiryComplete && cardCvcComplete && billingName.trim().length >= 3
    : isBoletoMode
      ? Boolean(String(billingNameDefault || "").trim() && String(customerEmail || "").trim() && String(billingTaxId || "").trim())
      : paymentElementComplete;

  useEffect(() => {
    const container = paymentElementContainerRef.current;
    if (!container) return;
    container.scrollIntoView({ behavior: "smooth", block: "start" });
    container.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    onElementStateChange?.({
      ready: paymentReady,
      complete: paymentComplete,
    });
  }, [onElementStateChange, paymentComplete, paymentReady]);

  function handlePaymentElementChange(event: StripePaymentElementChangeEvent) {
    const complete = Boolean(event.complete);
    setPaymentElementComplete(complete);
    if (previousCompleteRef.current !== complete) {
      previousCompleteRef.current = complete;
      console.info("[checkout] PaymentElement completion changed", { complete });
    }
  }

  function handleCardNumberChange(event: StripeCardNumberElementChangeEvent) {
    setCardNumberComplete(Boolean(event.complete));
    if (event.error?.message) setErrorMessage(String(event.error.message || "").trim());
    else setErrorMessage("");
  }

  function handleCardExpiryChange(event: StripeCardExpiryElementChangeEvent) {
    setCardExpiryComplete(Boolean(event.complete));
    if (event.error?.message) setErrorMessage(String(event.error.message || "").trim());
    else setErrorMessage("");
  }

  function handleCardCvcChange(event: StripeCardCvcElementChangeEvent) {
    setCardCvcComplete(Boolean(event.complete));
    if (event.error?.message) setErrorMessage(String(event.error.message || "").trim());
    else setErrorMessage("");
  }

  const payButtonDisabled = !stripe || !elements || isSubmitting;

  const submitPayment = useCallback(async (): Promise<boolean> => {
    setErrorMessage("");

    if (!stripe || !elements || !paymentReady || !paymentComplete) {
      setErrorMessage("Preencha corretamente os dados de pagamento para continuar.");
      return false;
    }

    setIsSubmitting(true);
    try {
      const cardNumberElement = isCardMode ? elements.getElement(CardNumberElement) : null;
      if (isCardMode && (!cardNumberElement || !String(clientSecret || "").trim())) {
        setErrorMessage("Não foi possível preparar os campos do cartão. Atualize a página e tente novamente.");
        return false;
      }

      const result = isCardMode
        ? await stripe.confirmCardPayment(
            String(clientSecret || "").trim(),
            {
              payment_method: {
                card: cardNumberElement as NonNullable<typeof cardNumberElement>,
                billing_details: {
                  name: billingName.trim(),
                  email: customerEmail || undefined,
                },
              },
            },
            { handleActions: true }
          )
        : isBoletoMode
          ? await stripe.confirmBoletoPayment(String(clientSecret || "").trim(), {
              payment_method: {
                boleto: {
                  tax_id: String(billingTaxId || "").trim(),
                },
                billing_details: {
                  name: String(billingNameDefault || "").trim(),
                  email: String(customerEmail || "").trim(),
                  address: {
                    line1: String(billingAddress?.line1 || "").trim(),
                    city: String(billingAddress?.city || "").trim(),
                    state: String(billingAddress?.state || "").trim(),
                    postal_code: String(billingAddress?.postalCode || "").trim(),
                    country: String(billingAddress?.country || "BR").trim() || "BR",
                  },
                },
              },
            })
        : await stripe.confirmPayment({
            elements,
            confirmParams: {
              return_url: successUrl,
              receipt_email: customerEmail || undefined,
            },
            redirect: "if_required",
          });

      if (result.error) {
        const failedMessage = String(result.error.message || "Pagamento recusado pelo emissor do cartao.").trim();
        router.push(buildConfirmationPath("failed", orderId, customerEmail, failedMessage));
        return false;
      }

      const paymentIntentStatus = String(result.paymentIntent?.status || "").toLowerCase();
      if (paymentIntentStatus === "succeeded") {
        clearCart();
        router.push(successPath);
        return true;
      }
      if (paymentIntentStatus === "processing") {
        clearCart();
        router.push(processingPath);
        return true;
      }
      if (paymentIntentStatus === "requires_action") {
        clearCart();
        router.push(processingPath);
        return true;
      }
      if (paymentIntentStatus === "requires_capture") {
        clearCart();
        router.push(processingPath);
        return true;
      }

      const statusMessage = paymentIntentStatus ? `Status inesperado: ${paymentIntentStatus}` : "Falha ao confirmar pagamento.";
      router.push(buildConfirmationPath("failed", orderId, customerEmail, statusMessage));
      return false;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Não foi possível confirmar o pagamento.";
      setErrorMessage(message);
      return false;
    } finally {
      setIsSubmitting(false);
    }
  }, [
    billingName,
    clientSecret,
    clearCart,
    customerEmail,
    billingAddress?.city,
    billingAddress?.country,
    billingAddress?.line1,
    billingAddress?.postalCode,
    billingAddress?.state,
    billingNameDefault,
    billingTaxId,
    elements,
    processingPath,
    router,
    successUrl,
    stripe,
    successPath,
    isCardMode,
    isBoletoMode,
    paymentComplete,
    paymentReady,
  ]);
  submitPaymentRef.current = submitPayment;

  useEffect(() => {
    if (!onSubmitActionChange) return;
    const registeredAction = () => submitPaymentRef.current();
    onSubmitActionChange({ fn: registeredAction });
    return () => {
      onSubmitActionChange(null);
    };
  }, [onSubmitActionChange]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await submitPayment();
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <div ref={paymentElementContainerRef} className={styles.paymentElementContainer} tabIndex={-1}>
        {isCardMode ? (
          <div className={styles.cardForm}>
            <label className={`${styles.field} ${styles.fieldFull}`}>
              <span>Numero do cartao</span>
              <div className={styles.stripeFieldShell}>
                <CardNumberElement
                  options={cardNumberOptions}
                  onReady={() => setCardNumberReady(true)}
                  onChange={handleCardNumberChange}
                />
              </div>
            </label>

            <label className={`${styles.field} ${styles.fieldFull}`}>
              <span>Nome no cartao</span>
              <input
                type="text"
                value={billingName}
                onChange={(event) => setBillingName(String(event.target.value || "").slice(0, 64))}
                placeholder="Como aparece no cartão"
                autoComplete="cc-name"
              />
            </label>

            <label className={styles.field}>
              <span>Validade</span>
              <div className={styles.stripeFieldShell}>
                <CardExpiryElement
                  options={cardExpiryOptions}
                  onReady={() => setCardExpiryReady(true)}
                  onChange={handleCardExpiryChange}
                />
              </div>
            </label>

            <label className={styles.field}>
              <span>CVV</span>
              <div className={styles.stripeFieldShell}>
                <CardCvcElement
                  options={cardCvcOptions}
                  onReady={() => setCardCvcReady(true)}
                  onChange={handleCardCvcChange}
                />
              </div>
            </label>
          </div>
        ) : isBoletoMode ? null : (
          <PaymentElement
            options={paymentElementOptions}
            onReady={() => {
              setPaymentElementReady(true);
            }}
            onLoadError={() => {
              setPaymentElementReady(false);
              setErrorMessage("Não foi possível carregar os métodos de pagamento. Atualize a página e tente novamente.");
            }}
            onChange={handlePaymentElementChange}
          />
        )}
      </div>
      {errorMessage ? (
        <p role="alert" className={styles.error}>
          {errorMessage}
        </p>
      ) : null}
      {showSubmitButton ? (
        <button type="submit" className={styles.payButton} disabled={payButtonDisabled}>
          {isSubmitting ? "Processando..." : submitLabel || "Confirmar pagamento"}
        </button>
      ) : null}
    </form>
  );
}
