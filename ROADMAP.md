# Roadmap TSEBI

## Fase 1 - MVP Producao (implementada)

- PostgreSQL com migrations SQL
- Script de migracao JSON -> DB
- Checkout com validacao de estoque em backend
- Baixa de estoque somente apos `payment_intent.succeeded`
- Webhook idempotente com tabela `webhook_events`
- Auth obrigatoria para comprar
- Sessao segura em cookie (`httpOnly`, `sameSite=lax`, `secure` em producao)
- Reset de senha com token em DB e expiracao
- Hardening basico: helmet, CORS, rate limit, validacao com zod
- Documentacao de setup, migracao e testes

## Fase 2 - Operacao (proxima)

- Backoffice/admin (produtos, estoque, pedidos)
- Frete real (Correios/transportadora)
- Emails transacionais (pedido, pagamento, envio, reset senha)
- Politica completa de troca/devolucao integrada ao pedido
- Analytics de funil (view_item, add_to_cart, begin_checkout, purchase)

## Fase 3 - Escala (futuro)

- SEO/performance (sitemap, robots, imagens otimizadas, CWV mobile)
- Observabilidade (logs estruturados, tracing, alertas)
- Testes automatizados (API, webhook, checkout E2E)
- CI/CD com staging, migrations e deploy seguro
