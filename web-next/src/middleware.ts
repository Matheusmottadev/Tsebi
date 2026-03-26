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

const BLOCKED_PATHS = [
  // Paths de admin nunca devem ser acessados por bots
  "/studio",
  "/admin",
];

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

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Aplica em todas as rotas exceto assets estáticos do Next.js e arquivos de mídia
    "/((?!_next/static|_next/image|favicon\\.ico|images/|css/|JS/|sw\\.js).*)",
  ],
};
