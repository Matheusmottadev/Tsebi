export interface GiftCard {
  id: string;
  code: string;
  initialBalanceCents: number;
  balanceCents: number;
  currency: string;
  active: boolean;
  expiresAt: string | null;
  note: string;
  maxUses: number;
  useCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface GiftCardTransaction {
  id: string;
  giftCardId: string;
  orderId: string | null;
  userId: string | null;
  deltaCents: number;
  balanceAfterCents: number;
  reason: string;
  createdAt: string;
}
