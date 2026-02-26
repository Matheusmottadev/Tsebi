import { post } from "@/lib/http";
import type { CouponEvaluation } from "@/types";

/*
Endpoint mapping used in this file:
- POST /api/discount-codes/apply
*/

export interface DiscountPreviewPayload {
  subtotalCents: number;
  shippingCents?: number;
}

/**
 * POST /api/discount-codes/apply
 * Auth: public.
 */
export async function applyDiscountCode(code: string, preview: DiscountPreviewPayload): Promise<CouponEvaluation> {
  return post<CouponEvaluation>("/api/discount-codes/apply", {
    code,
    subtotalCents: Math.max(0, Math.floor(Number(preview.subtotalCents || 0))),
    shippingCents: Math.max(0, Math.floor(Number(preview.shippingCents || 0))),
  });
}
