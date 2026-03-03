# Recommendation + Tracking (Enterprise)

## 1) Environment variables

### Frontend (`web-next`)
- `NEXT_PUBLIC_POSTHOG_KEY`
- `NEXT_PUBLIC_POSTHOG_HOST` (ex: `https://us.i.posthog.com`)
- `NEXT_PUBLIC_META_PIXEL_ID`

### Backend (`server`)
- `POSTHOG_API_KEY` (server key)
- `POSTHOG_HOST` (ex: `https://us.i.posthog.com`)
- `META_PIXEL_ID` (optional if using same value from public env)
- `META_CAPI_TOKEN` (Meta Conversions API token)
- `APP_BASE_URL` (ex: `https://www.tsebi.com.br`)

## 2) Database schema

Migration added:
- `server/db/migrations/016_behavior_affinity.sql`

Tables:
- `behavior_events`: raw events (dedup by `event_id`)
- `user_affinity`: affinity scores by `actor_key` and `affinity_key`
- `recommendation_profiles`: aggregated profile (`ltv_cents`, `purchase_count`, top categories, price bucket)

Run migrations:
```bash
npm run migrate
```

## 3) Event ingestion API

### `POST /api/events`
Captures and routes events to:
- local DB (`behavior_events`)
- PostHog server capture
- Meta CAPI (Purchase/AddToCart/InitiateCheckout + dedup `event_id`)

Supported events:
- `view_item`
- `view_item_list`
- `search`
- `add_to_cart`
- `remove_from_cart`
- `begin_checkout`
- `purchase`
- `favorite_toggle`
- `view_recommendations`
- `click_recommendation`

## 4) Identity merge API

### `POST /api/identify`
Payload:
```json
{
  "anon_id": "anon_xxx",
  "user_id": "uuid-or-user-id"
}
```

Behavior:
- merges anonymous history into user history
- merges affinities/profile
- sends alias/identify to PostHog server

## 5) Recommendations API

### `GET /api/recommendations?placement=search&limit=6`
Accepts identity via:
- session user
- `userId` query
- `anon_id` query or header `x-anon-id`

Returns:
- `products` (full product objects for current storefront)
- `items` (normalized shape for recommendation widgets):
```json
[
  {
    "product_id": "sku",
    "name": "Produto",
    "price": 10000,
    "image_url": "/images/...",
    "category": "Jaquetas",
    "link": "/product/sku"
  }
]
```

## 6) Stripe integration

`/api/orders/payment-intent` now sets metadata:
- `userId`
- `top_categories`
- `ticket_bucket`
- `avg_item_ticket_bucket`

On webhook success (`payment_intent.succeeded`):
- purchase event is persisted + forwarded
- profile is updated (LTV / purchase count / buckets)

