# Stripe Testing - TSEBI

## 1) Setup rapido

```bash
npm install
docker compose up -d
npm run migrate
npm run migrate:json
npm run dev
```

Acesse: `http://localhost:4242/cart.html`

## 2) Variaveis obrigatorias

No `.env`:

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/tsebi
STRIPE_SECRET_KEY=sk_test_xxx
STRIPE_PUBLISHABLE_KEY=pk_test_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx
SESSION_SECRET=change-this-secret
```

## 3) Listener de webhook

```bash
stripe listen --forward-to localhost:4242/api/stripe/webhook
```

Copie o `whsec_...` para `STRIPE_WEBHOOK_SECRET`.

## 4) Metodos no Dashboard

Habilite em modo teste:

- Card
- Pix
- Boleto
- Apple Pay
- Google Pay

## 5) Login obrigatorio no checkout

1. Abra `cart.html` deslogado.
2. Tente avancar para Entrega/Pagamento.
3. Deve redirecionar para `conta.html?returnUrl=...`.
4. Apos login/cadastro, deve voltar ao checkout no step certo.

## 6) Fluxos de pagamento

### Cartao aprovado

- Use `4242 4242 4242 4242`.
- Resultado esperado:
  - Stripe confirma pagamento.
  - Webhook marca pedido como `paid`.
  - Estoque baixa uma unica vez.

### Pix/Boleto (assincronos)

- Selecione no Payment Element.
- Resultado esperado:
  - Pagina de resultado pode mostrar `processing`.
  - Quando webhook confirmar, muda para `paid`.

### Falha

- Use cartao de falha do Stripe.
- Resultado esperado: pedido `failed`.

## 7) Reembolso/cancelamento

- Em `order.html`, pedido `paid` permite reembolso dentro da janela configurada.
- Pedido em `pending_payment/processing` permite cancelamento (se Stripe aceitar).

## 8) Apple Pay / Google Pay

As wallets aparecem somente quando:

- HTTPS
- Metodo habilitado no Dashboard
- Navegador/dispositivo compativeis
- Apple Pay com domain verification

Teste local com HTTPS:

```bash
ngrok http 4242
```

## 9) Idempotencia do webhook

A tabela `webhook_events` evita processamento duplicado pelo `stripe_event_id`.
Reenvio do mesmo evento nao deve gerar nova baixa de estoque.
