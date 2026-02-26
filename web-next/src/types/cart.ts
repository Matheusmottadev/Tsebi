export interface CartItemVariantSnapshot {
  variantId: string | null;
  variantName: string | null;
  size: string | null;
  color: string | null;
}

export interface CartItem {
  key: string;
  productId: string;
  name: string;
  unitAmount: number;
  currency: string;
  imageUrl: string | null;
  qty: number;
  variant: CartItemVariantSnapshot;
}

export interface CartSnapshot {
  version: 1;
  currency: string | null;
  items: CartItem[];
}

export interface AddCartItemInput {
  productId: string;
  name: string;
  unitAmount: number;
  currency: string;
  imageUrl?: string | null;
  variant?: Partial<CartItemVariantSnapshot> | null;
}
