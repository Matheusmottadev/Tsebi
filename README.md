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
APP_NAME=Tsebi
EMAIL_PROVIDER=console
EMAIL_FROM=no-reply@tsebi.com.br
RESEND_API_KEY=
SHIPPING_PROVIDER=melhorenvio
MELHOR_ENVIO_TOKEN=
MELHOR_ENVIO_ENV=sandbox
SHIP_FROM_ZIP=01001000
DEFAULT_PACKAGE_WEIGHT_KG=0.3
DEFAULT_PACKAGE_LENGTH_CM=20
DEFAULT_PACKAGE_WIDTH_CM=15
DEFAULT_PACKAGE_HEIGHT_CM=5
ADMIN_EMAILS=admin@seudominio.com.br
ADMIN_MFA_ENCRYPTION_KEY=defina-uma-chave-forte-unica-aqui
ADMIN_IDLE_TIMEOUT_MINUTES=20
ADMIN_MFA_ISSUER=Tsebi Studio
ADMIN_CSRF_COOKIE_NAME=tsebi.admin.csrf
ADMIN_AUDIT_RETENTION_DAYS=30
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

## Frete (Melhor Envio)

- Cotacao por CEP no endpoint `POST /api/shipping/quote`.
- Selecao de cotacao no endpoint `POST /api/orders/:id/shipping/select`.
- `PaymentIntent` considera `subtotal + frete`.
- Selecao de frete e shipment pendente sao persistidos no banco.

### Endpoints de frete

- `POST /api/shipping/quote`
- `POST /api/orders/:id/shipping/select`
- `POST /api/admin/orders/:id/shipping/buy-label`
- `GET /api/admin/orders/:id/shipping/label`
- `GET /api/admin/orders/:id/shipping/track`

Formato de resposta padrao destes endpoints:

- sucesso: `{ ok: true, data: ... }`
- falha: `{ ok: false, error: "CODIGO_DE_ERRO" }`

### Estrutura interna de frete

- `src/routes/shipping.routes.js`
- `src/routes/admin.shipping.routes.js`
- `src/shipping/provider.interface.js`
- `src/shipping/providers/melhorenvio.js`
- `src/shipping/providers/dummy.js`
- `src/shipping/shipping.service.js`
- `src/db/queries/shipping.queries.js`

### Migration de frete

- `server/db/migrations/005_shipping_system.sql`
- cria `shipping_quotes` e `shipments`
- adiciona campos de selecao de frete em `orders`

## Autenticacao

### Endpoints

- `POST /api/auth/check-email`
- `POST /api/auth/register`
- `POST /api/auth/email/verify-account`
- `POST /api/auth/email/resend-account-code`
- `POST /api/auth/login`
- `POST /api/auth/login/verify-code`
- `POST /api/auth/logout`
- `GET /api/auth/me`
- `POST /api/auth/forgot-password`
- `POST /api/auth/forgot-password/verify-code`
- `POST /api/auth/reset-password` (legado, deprecated)

### Endpoints Studio Auth (admin)

- `GET /api/studio-auth/me`
- `POST /api/studio-auth/login`
- `POST /api/studio-auth/mfa/setup/init`
- `POST /api/studio-auth/mfa/verify`
- `POST /api/studio-auth/mfa/recovery/regenerate`
- `POST /api/studio-auth/mfa/disable`
- `POST /api/studio-auth/logout`

### Endpoints Admin Audit (Studio)

- `GET /api/admin/audit-logs`
- `POST /api/admin/audit-logs/:id/reverse`

### Recuperacao de senha

- No fluxo atual, `forgot-password` envia codigo de 6 digitos por email.
- `forgot-password/verify-code` valida o codigo e redefine a senha.
- Em `NODE_ENV=development`, a API devolve `devCode` para facilitar testes locais.

### Verificacao de email

- Cadastro exige confirmacao de email por codigo de 6 digitos.
- Login exige confirmacao por codigo de 6 digitos enviado por email.
- Usuarios antigos sao marcados como verificados na migration `004_auth_email_security.sql`.

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

## Seguranca do Studio (admin)

- Login do Studio separado do login de cliente:
  - Pagina: `/studio-login` (ou `/studio-login.html`)
  - Loading: `/studio` (ou `/loading-studio.html`)
  - Painel: `/studio-portal` (ou `/studio-portal.html`)
- MFA TOTP obrigatorio para admins (`/api/studio-auth/*`).
- Segredo MFA admin criptografado no banco usando `ADMIN_MFA_ENCRYPTION_KEY`.
- Codigos de recuperacao de MFA armazenados em hash e consumidos 1x.
- Timeout de inatividade admin controlado por `ADMIN_IDLE_TIMEOUT_MINUTES`.
- CSRF em rotas mutaveis admin (`POST/PATCH/DELETE`) com validacao de cookie + header `x-csrf-token`.
- Auditoria de mudancas do Studio com ator, resumo, horario e reversao ate 30 dias.
- Logout do cliente e logout do Studio sao separados para evitar mistura de fluxo.

## Admin panel

- URL principal: `/studio` (loading) -> `/studio-login` -> `/studio-portal`
- Requer email em `ADMIN_EMAILS` e MFA concluido
- Modulos iniciais:
  - Usuarios (listar, criar, editar, excluir)
  - Pedidos (listar, alterar status)
  - Produtos (listar, criar, editar, arquivar)
  - Lista VIP (listar, criar, editar, excluir)
  - Auditoria (timeline de mudancas + botao de reversao)

## Deploy basico

Pode ser usado em Render/Railway/Fly:

1. Provisionar PostgreSQL
2. Configurar variaveis de ambiente
3. Rodar `npm run migrate`
4. Publicar app com `npm start`
5. Garantir HTTPS
6. Configurar webhook Stripe para `/api/stripe/webhook`

### Variaveis obrigatorias em Railway/Vercel (Studio)

- `ADMIN_EMAILS` com os emails admin (separados por virgula)
- `ADMIN_MFA_ENCRYPTION_KEY` (chave forte exclusiva para criptografar segredo MFA)
- `ADMIN_IDLE_TIMEOUT_MINUTES` (ex.: `20`)
- `ADMIN_MFA_ISSUER` (nome exibido no app autenticador, ex.: `Tsebi Studio`)
- `ADMIN_CSRF_COOKIE_NAME` (opcional; padrao `tsebi.admin.csrf`)
- `ADMIN_AUDIT_RETENTION_DAYS` (opcional; padrao `30`)

## Compatibilidade

Endpoints de checkout e conta foram mantidos para nao quebrar o frontend atual.
