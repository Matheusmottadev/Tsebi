export type OrderStatus =
  | "pending_payment"
  | "processing"
  | "paid"
  | "failed"
  | "canceled"
  | "refunded";

export type OrderTrackingState =
  | "ORDER_PLACED"
  | "PROCESSING"
  | "SHIPPED"
  | "IN_TRANSIT"
  | "OUT_FOR_DELIVERY"
  | "DELIVERED"
  | "EXCEPTION";

export interface OrderItem {
  id: string;
  name: string;
  qty: number;
  unitAmount: number;
  currency: string;
}

export interface OrderStockIssue {
  id: string;
  reason: "unknown_product" | "insufficient_stock" | string;
  requestedQty?: number;
  availableStock?: number;
}

export interface OrderShippingSnapshot {
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
  discountCode?: string;
  discountCents?: number;
  selectedProvider?: string;
  selectedService?: string;
  selectedServiceCode?: string;
  selectedCarrierName?: string;
  shippingDeadlineDays?: number | null;
  [key: string]: unknown;
}

export interface Order {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  currentStatus: OrderTrackingState;
  stockCommitted: boolean;
  createdAt: string;
  updatedAt: string;
  paymentMethod: string | null;
  installments: number;
  currency: string;
  amount: number;
  itemsAmount: number;
  shippingAmount: number;
  shippingPriceCents: number;
  shippingSelectedProvider: string;
  shippingSelectedService: string;
  shippingSelectedServiceCode: string;
  shippingSelectedCarrierName: string;
  shippingDeadlineDays: number | null;
  shippingDestinationZip: string;
  shippingDeadline: string | null;
  adminNotes: string;
  trackingCode: string;
  trackingId: string;
  trackingStatus: string;
  carrier: string;
  lastTrackingUpdate: string | null;
  items: OrderItem[];
  // TODO confirm all possible keys in shipping_json from legacy payloads.
  shipping: OrderShippingSnapshot | null;
  userId: string | null;
  userEmail: string | null;
  userName: string | null;
  stripePaymentIntentId: string | null;
  stripeRefundId: string | null;
  paidAt: string | null;
  shippedAt: string | null;
  deliveredAt: string | null;
  canceledAt: string | null;
  refundedAt: string | null;
  failureReason: string | null;
  cancellationReason: string | null;
  // TODO confirm if stock_issues can include additional shapes besides inventory issues.
  stockIssues: OrderStockIssue[] | null;
}
