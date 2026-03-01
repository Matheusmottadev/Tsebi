"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import type { StripePaymentElementChangeEvent } from "@stripe/stripe-js";
import styles from "./CheckoutPaymentForm.module.css";

type CheckoutPaymentFormProps = {
  orderId: string;
  customerEmail: string;
  paymentMethodOrder?: string[];
  submitLabel?: string;
  onElementStateChange?: (state: { ready: boolean; complete: boolean }) => void;
};

function buildSuccessPath(orderId: string, customerEmail: string): string {
  const params = new URLSearchParams();
  params.set("orderId", String(orderId || "").trim());
  const safeEmail = String(customerEmail || "").trim().toLowerCase();
  if (safeEmail) params.set("email", safeEmail);
  return `/checkout/success?${params.toString()}`;
}

function buildSuccessUrl(successPath: string): string {
  const siteUrl = String(process.env.NEXT_PUBLIC_SITE_URL || "").trim();
  const baseUrl = siteUrl ? siteUrl.replace(/\/+$/, "") : window.location.origin;
  return `${baseUrl}${successPath}`;
}

function buildFailurePath(orderId: string, customerEmail: string, message: string): string {
  const params = new URLSearchParams();
  if (message) params.set("message", message);
  const safeOrderId = String(orderId || "").trim();
  if (safeOrderId) params.set("orderId", safeOrderId);
  const safeEmail = String(customerEmail || "").trim().toLowerCase();
  if (safeEmail) params.set("email", safeEmail);
  return `/checkout/failure?${params.toString()}`;
}

export function CheckoutPaymentForm({
  orderId,
  customerEmail,
  paymentMethodOrder = [],
  submitLabel,
  onElementStateChange
}: CheckoutPaymentFormProps) {
  const router = useRouter();
  const stripe = useStripe();
  const elements = useElements();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [paymentElementReady, setPaymentElementReady] = useState(false);
  const [paymentElementComplete, setPaymentElementComplete] = useState(false);
  const paymentElementContainerRef = useRef<HTMLDivElement | null>(null);
  const previousCompleteRef = useRef<boolean | null>(null);

  const successPath = useMemo(() => buildSuccessPath(orderId, customerEmail), [orderId, customerEmail]);
  const successUrl = useMemo(() => buildSuccessUrl(successPath), [successPath]);
  const paymentElementOptions = useMemo(
    () => ({
      layout: "tabs" as const,
      wallets: {
        applePay: "auto" as const,
        googlePay: "auto" as const,
      },
      paymentMethodOrder: Array.isArray(paymentMethodOrder) ? paymentMethodOrder.filter(Boolean) : []
    }),
    [paymentMethodOrder]
  );

  useEffect(() => {
    const container = paymentElementContainerRef.current;
    if (!container) return;
    container.scrollIntoView({ behavior: "smooth", block: "start" });
    container.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    onElementStateChange?.({
      ready: paymentElementReady && Boolean(stripe) && Boolean(elements),
      complete: paymentElementComplete,
    });
  }, [elements, onElementStateChange, paymentElementComplete, paymentElementReady, stripe]);

  function handlePaymentElementChange(event: StripePaymentElementChangeEvent) {
    const complete = Boolean(event.complete);
    setPaymentElementComplete(complete);
    if (previousCompleteRef.current !== complete) {
      previousCompleteRef.current = complete;
      console.info("[checkout] PaymentElement completion changed", { complete });
    }
  }

  const payButtonDisabled = !stripe || !elements || !paymentElementReady || !paymentElementComplete || isSubmitting;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage("");

    if (!stripe || !elements || !paymentElementReady || !paymentElementComplete) {
      setErrorMessage("Payment form is still loading. Please try again.");
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await stripe.confirmPayment({
        elements,
        confirmParams: {
          return_url: successUrl,
          receipt_email: customerEmail || undefined,
        },
        redirect: "if_required",
      });

      if (result.error) {
        const message = result.error.message || "Payment confirmation failed.";
        router.push(buildFailurePath(orderId, customerEmail, message));
        return;
      }

      const paymentIntentStatus = String(result.paymentIntent?.status || "").toLowerCase();
      if (paymentIntentStatus === "succeeded" || paymentIntentStatus === "processing") {
        router.push(successPath);
        return;
      }

      router.push(
        buildFailurePath(
          orderId,
          customerEmail,
          paymentIntentStatus ? `Unexpected payment status: ${paymentIntentStatus}` : "Unexpected payment state."
        )
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Payment confirmation failed.";
      setErrorMessage(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <div ref={paymentElementContainerRef} className={styles.paymentElementContainer} tabIndex={-1}>
        <PaymentElement
          options={paymentElementOptions}
          onReady={() => {
            setPaymentElementReady(true);
          }}
          onLoadError={() => {
            setPaymentElementReady(false);
            setErrorMessage("Nao foi possivel carregar os metodos de pagamento. Atualize a pagina e tente novamente.");
          }}
          onChange={handlePaymentElementChange}
        />
      </div>
      {errorMessage ? (
        <p role="alert" className={styles.error}>
          {errorMessage}
        </p>
      ) : null}
      <button type="submit" className={styles.payButton} disabled={payButtonDisabled}>
        {isSubmitting ? "Processando..." : submitLabel || "Confirmar pagamento"}
      </button>
    </form>
  );
}
