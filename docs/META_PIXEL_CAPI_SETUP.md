# Meta Pixel + CAPI (Railway)

## Variáveis de ambiente (Railway)

No serviço da API (`server`), configure:

- `META_PIXEL_ID=2086865055219865`
- `META_CAPI_ACCESS_TOKEN=<seu token da Conversions API>`
- `META_CAPI_ENABLED=true`
- `META_API_VERSION=v25.0`
- `META_TEST_EVENT_CODE=<opcional para teste>`

No serviço web Next (`web-next`), configure:

- `NEXT_PUBLIC_META_PIXEL_ID=2086865055219865`

## Comportamento

- Pixel browser:
  - inicializa uma vez no layout global.
  - `PageView` dispara em cada mudança de rota (SPA), sem duplicar no mesmo path.
- Purchase:
  - enviado pelo backend no `payment_intent.succeeded` (Stripe webhook), via Meta CAPI.
  - usa `event_id` determinístico por PaymentIntent: `pi_<payment_intent_id>_purchase`.

## Como testar

1. No Meta Events Manager, abra `Test events`.
2. Defina `META_TEST_EVENT_CODE` no Railway e redeploy da API.
3. Faça uma compra de teste.
4. Verifique no Railway logs:
   - `meta_capi_request`
   - `meta_capi_response`
   - `[meta] sending Purchase`
5. Verifique no browser (DevTools > Network):
   - `connect.facebook.net/en_US/fbevents.js`
   - requests para `facebook.com/tr` (PageView).
