import path from "node:path";
import { readFile } from "node:fs/promises";
import type { Metadata } from "next";
import Script from "next/script";

export const metadata: Metadata = {
  title: "Minha Conta",
  description: "Area da conta Tsebi com perfil, pedidos, favoritos e servicos exclusivos.",
  robots: {
    index: false,
    follow: false,
  },
};

const LEGACY_ACCOUNT_FILE = path.resolve(process.cwd(), "public/legacy/pages/conta.html");
const LEGACY_SCRIPT_SOURCES = [
  "/JS/user-utils.js?v=20260222a",
  "/JS/account-header-ui.js?v=20260225a",
  "/JS/account-header-stack-fix.js?v=20260222a",
  "/JS/account-orders.js?v=20260222b",
  "/JS/account-sections.js?v=20260222b",
  "/JS/account-profile.js?v=20260224a",
  "/JS/account-router.js?v=20260223a",
  "/JS/posthog.js",
] as const;

let legacyAccountMarkupPromise: Promise<string> | null = null;

function extractBodyContent(html: string): string {
  const match = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  return match ? String(match[1] || "") : "";
}

function rewriteLegacyAccountUrls(markup: string): string {
  return String(markup || "")
    .replace(/<script\b[\s\S]*?<\/script>/gi, "")
    .replace(/href="index\.html"/g, 'href="/"')
    .replace(/href="conta\.html"/g, 'href="/account"')
    .replace(/href="lancamento\.html"/g, 'href="/lancamento"')
    .replace(/href="nossa-historia\.html"/g, 'href="/nossa-historia"')
    .replace(/href="processos\.html"/g, 'href="/processos"')
    .replace(/href="faq\.html"/g, 'href="/faq"')
    .replace(/href="politica-privacidade\.html"/g, 'href="/politica-privacidade"')
    .replace(/href="aviso-legal\.html"/g, 'href="/aviso-legal"')
    .replace(/href="produto\.html\?id=/g, 'href="/produto?id=')
    .replace(/src="images\//g, 'src="/images/')
    .replace(/href="images\//g, 'href="/images/')
    .replace(/url\('images\//g, "url('/images/")
    .replace(/url\("images\//g, 'url("/images/')
    .replace(/url\(images\//g, "url(/images/");
}

async function loadLegacyAccountMarkup(): Promise<string> {
  if (!legacyAccountMarkupPromise) {
    legacyAccountMarkupPromise = (async () => {
      const html = await readFile(LEGACY_ACCOUNT_FILE, "utf8");
      return rewriteLegacyAccountUrls(extractBodyContent(html));
    })();
  }
  return legacyAccountMarkupPromise;
}

function buildLegacyLoaderScript(): string {
  const scripts = JSON.stringify(LEGACY_SCRIPT_SOURCES);
  return `
    (function loadLegacyAccountScripts() {
      var sources = ${scripts};
      var index = 0;
      function appendNext() {
        if (index >= sources.length) return;
        var src = String(sources[index++] || "");
        if (!src) {
          appendNext();
          return;
        }
        var existing = document.querySelector('script[data-legacy-account-src="' + src + '"]');
        if (existing) {
          appendNext();
          return;
        }
        var script = document.createElement("script");
        script.src = src;
        script.async = false;
        script.setAttribute("data-legacy-account-src", src);
        script.onload = appendNext;
        script.onerror = appendNext;
        document.body.appendChild(script);
      }
      appendNext();
    })();
  `;
}

export default async function AccountPage() {
  const legacyMarkup = await loadLegacyAccountMarkup();

  return (
    <>
      <div className="legacy-account-root" suppressHydrationWarning dangerouslySetInnerHTML={{ __html: legacyMarkup }} />
      <Script id="legacy-account-loader" strategy="afterInteractive">
        {buildLegacyLoaderScript()}
      </Script>
    </>
  );
}
