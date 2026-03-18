export type CouponType = "percent" | "fixed" | "free_shipping";

export interface Coupon {
  code: string;
  type: CouponType;
  percentOff: number;
  amountOffCents: number;
  minSubtotalCents: number;
  maxDiscountCents: number;
  maxUses: number;
  usedCount: number;
  firstPurchaseOnly: boolean;
  active: boolean;
  startsAt: string;
  expiresAt: string;
  description: string;
  createdAt: string;
  updatedAt: string;
}

export interface CouponEvaluation {
  ok: boolean;
  code: string;
  discountCents: number;
  subtotalCents: number;
  shippingCents: number;
  totalCents: number;
  type: CouponType;
  percentOff: number;
  amountOffCents: number;
  freeShipping?: boolean;
}
