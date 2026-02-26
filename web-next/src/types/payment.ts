import type { OrderStatus } from "./order";

export type PaymentMethod = "automatic" | "card" | (string & {});

export type StripePaymentIntentStatus =
  | "requires_payment_method"
  | "requires_confirmation"
  | "requires_action"
  | "processing"
  | "succeeded"
  | "canceled";

export type StripeWebhookEventType =
  | "payment_intent.succeeded"
  | "payment_intent.processing"
  | "payment_intent.payment_failed"
  | "payment_intent.canceled"
  | "charge.refunded";

export interface Payment {
  orderId: string;
  stripePaymentIntentId: string | null;
  stripeRefundId: string | null;
  paymentMethod: PaymentMethod;
  installments: number;
  amountCents: number;
  currency: string;
  orderStatus: OrderStatus;
  paidAt: string | null;
  canceledAt: string | null;
  refundedAt: string | null;
  failureReason: string | null;
  cancellationReason: string | null;
}

export interface PaymentIntentResponse {
  orderId: string;
  orderNumber: string;
  customerEmail: string;
  clientSecret: string;
  paymentIntentClientSecret: string;
  paymentMethodTypes?: string[];
}

export interface StripeWebhookEventRecord {
  stripeEventId: string;
  eventType: StripeWebhookEventType | string;
  processedAt: string;
}
