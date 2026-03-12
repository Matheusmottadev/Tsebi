import path from "node:path";
import { readFile } from "node:fs/promises";
import type { Metadata } from "next";
import Script from "next/script";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Minha Conta",
  description: "Area da conta Tsebi com perfil, pedidos, favoritos e servicos exclusivos.",
  robots: {
    index: false,
    follow: false,
  },
};

const LEGACY_ACCOUNT_FILE = path.resolve(process.cwd(), "public/legacy/pages/conta.html");
const LEGACY_CRITICAL_SCRIPTS = [
  "/JS/user-utils.js?v=20260312b",
  "/JS/account-header-ui.js?v=20260310a",
  "/JS/account-header-stack-fix.js?v=20260222a",
  "/JS/account-router.js?v=20260312c",
] as const;

const LEGACY_DEFERRED_SCRIPTS = [
  "/JS/account-orders.js?v=20260312a",
  "/JS/account-sections.js?v=20260310a",
  "/JS/account-profile.js?v=20260312b",
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
    .replace(/href="lancamento\.html"/g, 'href="/"')
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
  if (process.env.NODE_ENV !== "production") {
    const html = await readFile(LEGACY_ACCOUNT_FILE, "utf8");
    return rewriteLegacyAccountUrls(extractBodyContent(html));
  }

  if (!legacyAccountMarkupPromise) {
    legacyAccountMarkupPromise = (async () => {
      const html = await readFile(LEGACY_ACCOUNT_FILE, "utf8");
      return rewriteLegacyAccountUrls(extractBodyContent(html));
    })();
  }
  return legacyAccountMarkupPromise;
}

export default async function AccountPage() {
  const legacyMarkup = await loadLegacyAccountMarkup();

  return (
    <>
      <div className="legacy-account-root" suppressHydrationWarning dangerouslySetInnerHTML={{ __html: legacyMarkup }} />
      {LEGACY_CRITICAL_SCRIPTS.map((src) => (
        <Script key={src} src={src} strategy="afterInteractive" />
      ))}
      {LEGACY_DEFERRED_SCRIPTS.map((src) => (
        <Script key={src} src={src} strategy="lazyOnload" />
      ))}
    </>
  );
}
