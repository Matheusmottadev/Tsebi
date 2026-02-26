# Stripe Webhook Local Validation

This project receives Stripe webhooks at:

- `POST /api/stripe/webhook`

## 1) Start local backend

Run the Express API on port `4242`:

```bash
npm run dev
```

Confirm required env vars are set:

- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET` (set from Stripe CLI output when listening)

## 2) Start Stripe CLI forwarding

```bash
stripe listen --forward-to localhost:4242/api/stripe/webhook
```

Stripe CLI prints a signing secret (`whsec_...`). Put that value in:

- `STRIPE_WEBHOOK_SECRET`

Then restart backend if needed.

## 3) Generate checkout PaymentIntent

Create a checkout session from frontend or directly call:

- `POST /api/orders/payment-intent`

This creates/returns an order + `clientSecret`.

## 4) Trigger test webhook events

Examples:

```bash
stripe trigger payment_intent.succeeded
stripe trigger payment_intent.payment_failed
stripe trigger payment_intent.canceled
stripe trigger charge.refunded
```

Notes:

- `charge.refunded` is meaningful only when there is a charge/payment to refund.
- For full end-to-end validation, confirm payment from frontend using Stripe Elements test cards.

## 5) Verify DB state transitions

Check latest orders:

```sql
SELECT id, order_number, status, stripe_payment_intent_id, paid_at, refunded_at, failure_reason, updated_at
FROM orders
ORDER BY created_at DESC
LIMIT 20;
```

Check webhook idempotency registry:

```sql
SELECT stripe_event_id, event_type, processed_at
FROM webhook_events
ORDER BY processed_at DESC
LIMIT 20;
```

Expected behavior:

- `payment_intent.succeeded` => order moves to `paid`
- `payment_intent.payment_failed` => order moves to `failed`
- `payment_intent.canceled` => order moves to `canceled`
- `charge.refunded` => order moves to `refunded`

## 6) Operational log checkpoints

During tests, monitor backend logs for:

- `payment_intent_created` (order id + amount)
- `webhook_received` (event type + payment intent id)
- `order_status_changed` (from/to status)
- `webhook_processed` (outcome and reason)
