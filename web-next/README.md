# TSEBI Frontend Next.js (`web-next`)

This folder contains the new Next.js frontend scaffold.

## Current integration contract

- Frontend only: Next.js app.
- Backend remains the existing Express app on Railway.
- `/api/*` is proxied by Next rewrites to the Railway URL.
- No migration of API routes, Stripe webhook, auth/session behavior in this phase.

## Environment

Copy `.env.example` to `.env.local`:

```bash
cp .env.example .env.local
```

Variable:

- `API_PROXY_TARGET`: base URL of the Railway backend (without trailing slash).
- `NEXT_PUBLIC_API_BASE_URL`: base URL used by the frontend HTTP client.
- `NEXT_PUBLIC_SITE_URL`: optional canonical site URL for metadata.
- `NEXT_PUBLIC_CHECKOUT_ENABLED`: checkout safety gate. Keep `false` by default while Stripe is live.
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`: Stripe publishable key for Elements in checkout.

Example:

```env
API_PROXY_TARGET=https://tsebi-production.up.railway.app
NEXT_PUBLIC_API_BASE_URL=http://localhost:3000
NEXT_PUBLIC_SITE_URL=http://localhost:3000
NEXT_PUBLIC_CHECKOUT_ENABLED=false
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_xxxxxxxxxxxxx
```

## Checkout safety flag

- `NEXT_PUBLIC_CHECKOUT_ENABLED=false`: checkout entry points stay blocked in UI and `/checkout` shows maintenance.
- `NEXT_PUBLIC_CHECKOUT_ENABLED=true`: cart checkout button is enabled and `/checkout` can initialize PaymentIntent + Stripe Elements.
- This flag gates frontend checkout access during migration and prevents accidental payment attempts when disabled.

## Real checkout testing safety

- Prefer local backend while testing checkout: point `API_PROXY_TARGET` and `NEXT_PUBLIC_API_BASE_URL` to local Express.
- Use Stripe test publishable key in `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` for local tests.
- Do not point this frontend to live production unless you intentionally want to test real payments.

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## API proxy behavior

Configured in `next.config.ts`:

- source: `/api/:path*`
- destination: `${API_PROXY_TARGET}/api/:path*`

This keeps all existing backend routes in Express while the frontend migrates to Next.

## Production target

- Deploy this folder (`web-next`) to Vercel.
- Keep Railway as backend for `/api`.
