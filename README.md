# TSEBI Checkout (Node + Express + Stripe + PostgreSQL)

Projeto de e-commerce com checkout em 3 etapas no frontend estatico e backend Node/Express com Stripe Payment Element.

## Stack atual

- Frontend: HTML/CSS/JS estatico
- Backend: Express
- Pagamentos: Stripe PaymentIntent + Payment Element + webhook
- Banco: PostgreSQL (fase 1)
- Sessao: cookie `httpOnly` com `express-session`

## Scripts

```bash
npm run dev
npm start
npm run migrate
npm run migrate:json
```

## Configuracao de ambiente

Crie `.env` a partir de `.env.example`:

```env
PORT=4242
NODE_ENV=development
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/tsebi
STRIPE_SECRET_KEY=sk_test_xxx
STRIPE_PUBLISHABLE_KEY=pk_test_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx
SESSION_SECRET=change-this-secret
SESSION_COOKIE_NAME=tsebi.sid
CORS_ORIGIN=http://localhost:4242
```

## Rodando local com PostgreSQL

Opcao 1: Docker

```bash
docker compose up -d
```

Opcao 2: PostgreSQL local

- Suba um banco PostgreSQL e ajuste `DATABASE_URL`.

Depois execute:

```bash
npm install
npm run migrate
npm run migrate:json
npm run dev
```

Aplicacao: `http://localhost:4242`

## Migracao JSON -> DB

O script `npm run migrate:json` importa:

- `data/users.json` -> `users`
- `data/inventory.json` -> `products`
- `data/orders.json` -> `orders` + `order_items`

Observacoes:

- SKUs do JSON viram `products.sku`.
- Pedidos antigos sem `userId` podem existir e nao aparecem em `minha-conta`.

## Fluxo de checkout

1. Carrinho
2. Entrega
3. Pagamento (Stripe Payment Element)

`POST /api/orders/payment-intent` exige login (`401` sem sessao).

## Autenticacao

### Endpoints

- `POST /api/auth/check-email`
- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`
- `POST /api/auth/forgot-password`
- `POST /api/auth/reset-password`

### Recuperacao de senha

- `forgot-password` gera token com expiracao e salva no DB.
- Em `NODE_ENV=development`, o token e retornado na resposta (mock para testes).
- Em producao, conecte o envio por email usando esse token.

## Pedidos do usuario

- `GET /api/my/orders`
- `GET /api/my/orders/:orderId`
- `POST /api/my/orders/:orderId/cancel`
- `POST /api/my/orders/:orderId/refund`

## Estoque e webhook

- Estoque e validado antes do PaymentIntent.
- Estoque e baixado apenas no webhook `payment_intent.succeeded`.
- Webhook e idempotente via tabela `webhook_events` (`stripe_event_id` unico).
- Reenvio de webhook nao duplica baixa de estoque.

## Seguranca minima (fase 1)

- `helmet`
- `cors` configuravel por `CORS_ORIGIN`
- Rate limit em login/register, payment-intent e webhook
- Validacao de payload com `zod`
- Senha com hash `bcrypt`
- Cookies de sessao: `httpOnly`, `sameSite=lax`, `secure` somente em producao

## Deploy basico

Pode ser usado em Render/Railway/Fly:

1. Provisionar PostgreSQL
2. Configurar variaveis de ambiente
3. Rodar `npm run migrate`
4. Publicar app com `npm start`
5. Garantir HTTPS
6. Configurar webhook Stripe para `/api/stripe/webhook`

## Compatibilidade

Endpoints de checkout e conta foram mantidos para nao quebrar o frontend atual.
