# Production Cutover Checklist (Vercel Web + Railway API)

Date: 2026-02-25

## Target architecture

- Public website: Vercel (Next.js app from `web-next/`)
- API + sessions + Stripe webhook: Railway (existing Express app)
- Browser traffic pattern:
  - Frontend pages: `https://<your-domain>/*` (Vercel)
  - API calls: `https://<your-domain>/api/*` (rewritten/proxied to Railway)

## Vercel project settings (definitive)

- Framework Preset: `Next.js`
- Root Directory: `web-next`
- Install Command: `npm ci`
- Build Command: `npm run build`
- Output Directory: `.next`

## API rewrite config

Config file: `web-next/vercel.json`

- Rewrite:
  - Source: `/api/:path*`
  - Destination: `https://tsebi-production.up.railway.app/api/:path*`

Notes:

- Vercel rewrite preserves HTTP method, headers and body for API proxying (POST/PUT/PATCH/DELETE keep payload).
- `web-next/next.config.ts` keeps optional rewrite support for local development via `API_PROXY_TARGET`.

## Required Vercel environment variables

Set in Vercel project (Production/Preview as appropriate):

- `NEXT_PUBLIC_API_BASE_URL=https://<your-domain>`
- `NEXT_PUBLIC_SITE_URL=https://<your-domain>`
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=<LIVE publishable key>`
- `NEXT_PUBLIC_CHECKOUT_ENABLED=true` (only if checkout should be live)

Optional but recommended for local/dev parity:

- `API_PROXY_TARGET=https://tsebi-production.up.railway.app`

## Required Railway environment variables (must remain)

Core:

- `STRIPE_SECRET_KEY` (live)
- `STRIPE_WEBHOOK_SECRET`
- `SESSION_SECRET`
- `DATABASE_URL`

Auth/admin/security related:

- `ADMIN_EMAIL` and/or `ADMIN_EMAILS`
- `ADMIN_MFA_ENCRYPTION_KEY`
- `ADMIN_IDLE_TIMEOUT_MINUTES`
- `ADMIN_CSRF_COOKIE_NAME` (optional override)
- `AUTH_LOGIN_EMAIL_CODE_REQUIRED`

Email/passkey related (if used):

- `EMAIL_PROVIDER`
- `EMAIL_FROM` (or `RESEND_FROM_EMAIL`)
- `RESEND_API_KEY`
- `APP_BASE_URL`
- `WEBAUTHN_RP_ID`
- `WEBAUTHN_RP_NAME`
- `WEBAUTHN_ORIGIN`
- `GOOGLE_CLIENT_ID` (if Google login enabled)

## Cookie/session audit (Express)

Current session config (`server/session.js`):

- Cookie name: `SESSION_COOKIE_NAME` (default `tsebi.sid`)
- `httpOnly: true`
- `sameSite: "lax"`
- `secure: process.env.NODE_ENV === "production"`
- `maxAge`: `SESSION_MAX_AGE_DAYS` (default 30 days)
- `app.set("trust proxy", 1)` is already enabled in `server/index.js`

Assessment:

- For same-origin browser calls to `/api` on the main domain, this is compatible and stable.
- No auth/session logic change is required for cutover.

Operational requirement:

- Ensure Railway `NODE_ENV=production` so `secure=true` is enforced in HTTPS production.

If `NODE_ENV` cannot be guaranteed, apply minimal patch later to force secure cookie via env flag (do not change auth logic).

## Stripe webhook stability

- Keep webhook endpoint on Railway:
  - `https://tsebi-production.up.railway.app/api/stripe/webhook`
- Do **not** point Stripe webhook to Vercel.
- Do **not** move webhook processing from Express.

## Pre-cutover checks

1. Confirm Vercel project points to root directory `web-next`.
2. Confirm all Vercel env vars above are set in Production.
3. Confirm Railway env vars above are present and unchanged.
4. Confirm Stripe Dashboard webhook endpoint is Railway URL and shows valid signing secret.
5. Confirm DNS/domain switch plan and TTL window.
6. Confirm rollback target (previous frontend deployment) is still available.

## Post-cutover checks

Public storefront:

1. Home page loads (`/`).
2. Products list loads (`/products`).
3. Product detail loads (`/product/[id]` and `/produto/[id]` routes).

Commerce:

4. Cart add/remove/qty works and persists on refresh.
5. Checkout end-to-end works (only if `NEXT_PUBLIC_CHECKOUT_ENABLED=true`).

Customer account:

6. Login works on `/login`.
7. `/account` loads with session cookie.
8. Orders list/detail load correctly.

Studio admin:

9. `/studio/login` works.
10. MFA flow works (`mfa_required` / `mfa_setup_required`).
11. `/studio/orders` and `/studio/orders/[id]` load.
12. Perform one safe mutation with CSRF (recommended: update one product field in `/studio/products/[id]`).
13. `/studio/audit` shows entries.

Webhook:

14. After a real payment, Railway logs show webhook receipt and order status transition.
15. Confirm order status changes in account/admin are webhook-driven.

## Rollback plan (fastest)

1. Re-point main domain to previous frontend deployment (or previous Vercel deployment).
2. Keep `/api` destination unchanged (Railway Express stays API source of truth).
3. Re-run smoke checks for login/account/studio after rollback.
4. No DB migration rollback is required (this cutover changes routing/deployment only).
