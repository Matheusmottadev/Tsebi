import { get, HttpError, post } from "@/lib/http";
import type { HttpRequestOptions } from "@/lib/http";
import type { Order, PaymentIntentResponse, PaymentMethod } from "@/types";

/*
Endpoint mapping used in this file:
- GET /api/my/orders
- GET /api/my/orders/:orderId
- GET /api/account/orders
- POST /api/orders/payment-intent
*/

export interface ListMyOrdersResponse {
  orders: Order[];
}

export interface GetMyOrderResponse {
  order: Order;
}

// DTO: /api/account/orders is a tracking projection, not full Order from order-repository.
export interface OrderTrackingItemDto {
  id: string;
  name: string;
  qty: number;
  unitAmount: number;
  currency: string;
  image: string;
}

export interface OrderTrackingOrderDto {
  id: string;
  orderNumber: string;
  email: string;
  userId: string | null;
  status: string;
  currentStatus: string;
  trackingCode: string;
  carrier: string;
  shippedAt: string | null;
  deliveredAt: string | null;
  lastTrackingUpdate: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  items: OrderTrackingItemDto[];
}

export interface ListTrackingOrdersResponse {
  orders: OrderTrackingOrderDto[];
}

export interface CheckoutItemInput {
  id: string;
  qty: number;
}

export interface CheckoutShippingInput {
  firstName?: string;
  lastName?: string;
  fullName?: string;
  email?: string;
  phone?: string;
  cpf?: string;
  cep?: string;
  street?: string;
  number?: string;
  complement?: string;
  district?: string;
  city?: string;
  state?: string;
  shippingMethod?: string;
  shippingCost?: number;
  shippingEstimate?: string;
  quoteId?: string | null;
}

export interface CheckoutCustomerInput {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  cpf?: string;
}

export interface CheckoutShippingAddressInput {
  zip?: string;
  street?: string;
  number?: string;
  complement?: string;
  district?: string;
  city?: string;
  state?: string;
  country?: string;
}

export interface ShippingQuote {
  id: string;
  provider: string;
  serviceCode: string;
  serviceName: string;
  priceCents: number;
  deadlineDays: number | null;
  carrierName: string;
  destinationZip: string;
}

export interface QuoteShippingPayload {
  destinationZip: string;
  orderId?: string;
}

export interface QuoteShippingResponse {
  ok: boolean;
  data: {
    destinationZip: string;
    quotes: ShippingQuote[];
  };
}

export interface CreatePaymentIntentPayload {
  paymentMethod?: PaymentMethod;
  discountCode?: string;
  installments?: number;
  items: CheckoutItemInput[];
  shipping?: CheckoutShippingInput | null;
  customer?: CheckoutCustomerInput;
  shippingAddress?: CheckoutShippingAddressInput;
}

/**
 * GET /api/my/orders
 * Auth: required.
 */
export async function listMyOrders(options?: HttpRequestOptions): Promise<Order[]> {
  const response = await get<ListMyOrdersResponse>("/api/my/orders", { cache: "no-store", ...options });
  return Array.isArray(response.orders) ? response.orders : [];
}

/**
 * GET /api/my/orders/:orderId
 * Auth: required.
 */
export async function getMyOrder(orderId: string, options?: HttpRequestOptions): Promise<Order | null> {
  try {
    const response = await get<GetMyOrderResponse>(`/api/my/orders/${encodeURIComponent(orderId)}`, {
      cache: "no-store",
      ...options,
    });
    return response.order || null;
  } catch (error) {
    if (error instanceof HttpError && error.status === 404) return null;
    throw error;
  }
}

/**
 * GET /api/account/orders (client-side filtered by orderId)
 * Auth: required.
 */
export async function getOrderTracking(orderId: string): Promise<OrderTrackingOrderDto | null> {
  const response = await get<ListTrackingOrdersResponse>("/api/account/orders");
  const orders = Array.isArray(response.orders) ? response.orders : [];
  return orders.find((item) => String(item.id) === String(orderId)) || null;
}

/**
 * POST /api/orders/payment-intent
 * Auth: optional (supports logged and guest checkout).
 * Note: mutation endpoint exists for checkout flow; do not auto-trigger in demo UI.
 */
export async function createPaymentIntent(payload: CreatePaymentIntentPayload): Promise<PaymentIntentResponse> {
  return post<PaymentIntentResponse>("/api/orders/payment-intent", payload);
}

/**
 * POST /api/shipping/quote
 * Auth: optional (session improves quote binding).
 */
export async function quoteShipping(payload: QuoteShippingPayload): Promise<QuoteShippingResponse> {
  return post<QuoteShippingResponse>("/api/shipping/quote", payload);
}
