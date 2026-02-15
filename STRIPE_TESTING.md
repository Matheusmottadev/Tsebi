# Stripe Checkout Testing (3 Steps)

## 1. Setup

1. Install dependencies:

```bash
npm install
```

2. Create `.env` from `.env.example`:

```env
PORT=4242
STRIPE_SECRET_KEY=sk_test_xxx
STRIPE_PUBLISHABLE_KEY=pk_test_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx
```

3. Start server:

```bash
npm run dev
```

4. Open checkout:

`http://localhost:4242/cart.html`

## 2. Webhook (required)

Run in another terminal:

```bash
stripe listen --forward-to localhost:4242/api/stripe/webhook
```

Copy the generated `whsec_...` into `STRIPE_WEBHOOK_SECRET`.

## 3. New checkout flow (Cart > Shipping > Payment)

### Step 1: Cart
- Adjust quantity (`+` / `-`) or remove items.
- "Continuar para entrega" is disabled when cart is empty.
- Summary updates in real time.

### Step 2: Shipping
- Required fields:
  - full name
  - email
  - CEP
  - street
  - number
  - district
  - city
  - state
- CEP attempts auto-fill via ViaCEP on blur.
- Shipping method:
  - `Padrao (3-7 dias)`
  - `Expressa (1-3 dias)`
- Shipping cost and estimated delivery update summary.

### Step 3: Payment
- Methods:
  - card (Stripe Elements)
  - Pix (Stripe)
- Installments (1x to 6x) are shown only for card.
- Final action redirects to:
  - `payment-result.html?orderId=...`

## 4. Test scenarios

### Card success
1. Complete all 3 steps.
2. Use test card `4242 4242 4242 4242`.
3. Submit payment.

Expected:
- Order created as `pending_payment`.
- Webhook updates to `paid`.
- Result page shows `Pagamento confirmado`.

### Pix / async
1. Complete shipping.
2. Select `Pix`.
3. Submit payment and follow Stripe flow.

Expected:
- Result page opens in `Pagamento em processamento`.
- Polling every 3s (up to 2 minutes).
- Once webhook marks `paid`, UI changes to confirmed.

### Card failure
1. Use a failing Stripe test card.
2. Submit payment.

Expected:
- Result page eventually shows `Pagamento nao aprovado`.
- Actions shown: `Tentar novamente` and `Falar no WhatsApp`.

## 5. Backend payload compatibility

`POST /api/orders/payment-intent` still accepts:
- `items`
- `paymentMethod`
- `installments`

Now it also accepts optional:
- `shipping` object

Backend remains source of truth for:
- price
- stock
- shipping amount (same mock rule set used by checkout)

## 6. Useful endpoints

- `GET /api/config`
- `POST /api/orders/payment-intent`
- `GET /api/orders/:orderId`
- `POST /api/stripe/webhook`

## 7. Storage

- Orders: `data/orders.json`
- Inventory: `data/inventory.json`
- Client shipping draft: localStorage key `tsebi-checkout-shipping-v1`
