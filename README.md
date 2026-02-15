# TSEBI Checkout

This project now uses a 3-step checkout flow in `cart.html`:

1. Cart
2. Shipping
3. Payment

Key points:
- Stripe card and Pix payments.
- Installments up to 6x for card.
- Shipping data is persisted in localStorage (`tsebi-checkout-shipping-v1`).
- CEP auto-fill uses ViaCEP in frontend (dev-friendly).
- Final redirect goes to `payment-result.html?orderId=...`.

Backend:
- `POST /api/orders/payment-intent` accepts `items`, `paymentMethod`, `installments`, and optional `shipping`.
- Price and stock are validated on backend.

For full Stripe test flow, see:
- `STRIPE_TESTING.md`
