import { NextRequest, NextResponse } from "next/server";

// Crawlers legítimos com valor de SEO — passam sempre
const ALLOWED_BOTS = [
  "googlebot",
  "bingbot",
  "slurp", // Yahoo Search
];

// Bots que não trazem benefício e consomem banda / invocações
const BLOCKED_AGENTS = [
  // AI / LLM crawlers
  "gptbot",
  "chatgpt-user",
  "oai-searchbot",
  "google-extended",
  "ccbot",
  "anthropic-ai",
  "claude-web",
  "perplexitybot",
  "youbot",
  "bytespider",
  "applebot-extended",
  "facebookbot",
  "diffbot",
  "meta-externalagent",
  "facebookexternalhit",
  "cohere-ai",
  "amazonbot",
  "timpibot",
  "img2dataset",
  "omgili",
  "omgilibot",
  "petalbot",
  "dataprovider",
  "serpstatbot",
  // SEO scrapers (sem valor para loja BR)
  "ahrefsbot",
  "semrushbot",
  "mj12bot",
  "dotbot",
  "blexbot",
  "dataforseоbot",
  "majestic",
  "seokicks",
  "sistrix",
  "linkdexbot",
  "rogerbot",
  "exabot",
  "ia_archiver",
  "seznambot",
  "baiduspider",
  "yandexbot",
  "yandex.com/bots",
  "360spider",
  "sosospider",
  "sogou",
  "turnitinbot",
  "panscient",
  "proximic",
  // Ferramentas genéricas de scraping / automação
  "python-urllib",
  "python-requests",
  "scrapy",
  "libwww-perl",
  "lwp-trivial",
  "mechanize",
  "apache-httpclient",
  "okhttp",
  // Scanners de vulnerabilidade
  "nikto",
  "sqlmap",
  "nessus",
  "openvas",
  "acunetix",
  "masscan",
  "zgrab",
  "nuclei",
  "dirbuster",
  "nmap",
  "wpscan",
  "joomscan",
];

const BLOCKED_PATHS = ["/studio", "/admin"];

// Hosts externos autorizados a carregar scripts
// Mantidos como fallback para browsers sem suporte a 'strict-dynamic'
const SCRIPT_ALLOWLIST = [
  "https://js.stripe.com",
  "https://m.stripe.network",
  "https://checkout.stripe.com",
  "https://*.stripe.com",
  "https://www.googletagmanager.com",
  "https://www.google-analytics.com",
  "https://ssl.google-analytics.com",
  "https://connect.facebook.net",
  "https://www.facebook.com",
  "https://accounts.google.com",
  "https://www.google.com",
  "https://www.gstatic.com",
].join(" ");

function buildCsp(nonce: string): string {
  const directives = [
    `default-src 'self'`,
    // 'strict-dynamic' permite que scripts com nonce carreguem scripts filhos
    // (GTM → GA, Stripe SDK, etc.) sem precisar listar cada host.
    // A allowlist abaixo é fallback para browsers mais antigos.
    `script-src 'nonce-${nonce}' 'strict-dynamic' ${SCRIPT_ALLOWLIST}${process.env.NODE_ENV !== "production" ? " 'unsafe-eval'" : ""}`,
    // inline styles são necessários para React e bibliotecas de UI
    `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com`,
    `font-src 'self' data: https://fonts.gstatic.com`,
    `img-src 'self' data: blob: https:`,
    `connect-src 'self' https://*.stripe.com https://www.googletagmanager.com https://www.google-analytics.com https://region1.google-analytics.com https://stats.g.doubleclick.net https://graph.facebook.com https://connect.facebook.net https://www.facebook.com https://accounts.google.com https://oauth2.googleapis.com https://viacep.com.br https://us.i.posthog.com https://*.posthog.com`,
    `frame-src 'self' https://*.stripe.com https://accounts.google.com https://www.google.com`,
    `worker-src 'self' blob: https://js.stripe.com https://*.stripe.com`,
    `media-src 'self' data: blob: https: https://media.tsebi.com.br`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `frame-ancestors 'self'`,
    ...(process.env.NODE_ENV === "production" ? ["upgrade-insecure-requests"] : []),
  ];
  return directives.join("; ");
}

export function middleware(request: NextRequest) {
  const ua = (request.headers.get("user-agent") ?? "").toLowerCase();
  const pathname = request.nextUrl.pathname;

  // Bloqueia requisições sem User-Agent ou UA muito curto (suspeito)
  if (ua.length < 10) {
    return new NextResponse(null, { status: 403 });
  }

  // Crawlers legítimos passam (exceto se tentarem acessar área admin)
  const isGoodBot = ALLOWED_BOTS.some((bot) => ua.includes(bot));
  if (isGoodBot) {
    const isAdminPath = BLOCKED_PATHS.some((p) => pathname.startsWith(p));
    if (isAdminPath) {
      return new NextResponse(null, { status: 403 });
    }
    return NextResponse.next();
  }

  // Bloqueia bots ruins
  const isBlocked = BLOCKED_AGENTS.some((agent) => ua.includes(agent));
  if (isBlocked) {
    return new NextResponse(null, { status: 403 });
  }

  // Rotas de API são proxiadas para Railway — não adiciona CSP
  if (pathname.startsWith("/api/")) {
    return NextResponse.next();
  }

  // Em desenvolvimento, não aplica CSP para evitar hydration mismatch com nonce
  if (process.env.NODE_ENV !== "production") {
    return NextResponse.next();
  }

  // Gera nonce único por request para CSP sem unsafe-inline
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = buildCsp(nonce);

  // Injeta o nonce nos headers do request para que o server component
  // (layout.tsx) possa lê-lo via headers() e repassar aos <Script>
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });
  response.headers.set("Content-Security-Policy", csp);

  return response;
}

export const config = {
  matcher: [
    // Aplica em todas as rotas exceto assets estáticos do Next.js e arquivos de mídia
    "/((?!_next/static|_next/image|favicon\\.ico|images/|css/|JS/|sw\\.js).*)",
  ],
};
