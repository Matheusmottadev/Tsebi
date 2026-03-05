import path from "node:path";
import { readFile } from "node:fs/promises";

export const LEGACY_STATIC_PAGE_SLUGS = [
  "aviso-legal",
  "candidatura",
  "carreiras",
  "cookie-policy",
  "faq",
  "genesis",
  "loading-careers",
  "loading-studio",
  "nossa-historia",
  "order",
  "payment-result",
  "politica-privacidade",
  "processos",
  "recuperar-senha",
  "recuperar-senha-codigo",
] as const;

export type LegacyStaticPageSlug = (typeof LEGACY_STATIC_PAGE_SLUGS)[number];

type LegacyStaticPageDocument = {
  title: string;
  bodyMarkup: string;
  stylesheetHrefs: string[];
  inlineStyles: string[];
  scriptSrcs: string[];
  inlineScripts: string[];
};

function extractTagContent(html: string, tag: string): string {
  const match = html.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return match ? String(match[1] || "") : "";
}

function normalizeRootRelative(url: string): string {
  const raw = String(url || "").trim();
  if (!raw) return raw;
  if (/^(https?:)?\/\//i.test(raw)) return raw;
  if (raw.startsWith("/")) return raw;
  return `/${raw.replace(/^\.?\//, "")}`;
}

function rewriteLegacyUrls(markup: string): string {
  return String(markup || "")
    .replace(/href="index\.html"/g, 'href="/"')
    .replace(/href="lancamento\.html"/g, 'href="/"')
    .replace(/href="nossa-historia\.html"/g, 'href="/nossa-historia"')
    .replace(/href="processos\.html"/g, 'href="/processos"')
    .replace(/href="faq\.html"/g, 'href="/faq"')
    .replace(/href="cookie-policy\.html"/g, 'href="/cookie-policy"')
    .replace(/href="politica-privacidade\.html"/g, 'href="/politica-privacidade"')
    .replace(/href="aviso-legal\.html"/g, 'href="/aviso-legal"')
    .replace(/href="produto\.html\?id=/g, 'href="/produto?id=')
    .replace(/href="login\.html"/g, 'href="/login"')
    .replace(/href="conta\.html"/g, 'href="/account"')
    .replace(/src="images\//g, 'src="/images/')
    .replace(/href="images\//g, 'href="/images/')
    .replace(/url\('images\//g, "url('/images/")
    .replace(/url\("images\//g, 'url("/images/')
    .replace(/url\(images\//g, "url(/images/");
}

function stripLegacyChrome(markup: string): string {
  return String(markup || "")
    .replace(/<div class="top-bar"[\s\S]*?(?=<header\b)/i, "")
    .replace(/<header class="home-header"[\s\S]*?(?=<aside\b|<main\b|<section\b|<footer\b)/i, "")
    .replace(/<aside class="header-menu"[\s\S]*?(?=<main\b|<section\b|<footer\b)/i, "")
    .replace(/<div class="search-overlay"[\s\S]*?(?=<script\b|$)/i, "");
}

function extractStylesheetHrefs(headMarkup: string): string[] {
  const hrefs: string[] = [];
  const regex = /<link\b[^>]*rel=["'][^"']*stylesheet[^"']*["'][^>]*>/gi;
  let match: RegExpExecArray | null = regex.exec(headMarkup);
  while (match) {
    const tag = String(match[0] || "");
    const hrefMatch = tag.match(/\bhref=["']([^"']+)["']/i);
    const href = normalizeRootRelative(hrefMatch ? String(hrefMatch[1] || "") : "");
    if (href) hrefs.push(href);
    match = regex.exec(headMarkup);
  }
  return Array.from(new Set(hrefs));
}

function extractInlineStyles(headMarkup: string): string[] {
  const styles: string[] = [];
  const regex = /<style\b[^>]*>([\s\S]*?)<\/style>/gi;
  let match: RegExpExecArray | null = regex.exec(headMarkup);
  while (match) {
    const content = String(match[1] || "").trim();
    if (content) styles.push(content);
    match = regex.exec(headMarkup);
  }
  return styles;
}

function extractScripts(markup: string): { scriptSrcs: string[]; inlineScripts: string[]; bodyWithoutScripts: string } {
  const scriptSrcs: string[] = [];
  const inlineScripts: string[] = [];

  const bodyWithoutScripts = String(markup || "").replace(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi, (_full, attrs, content) => {
    const attrsText = String(attrs || "");
    const srcMatch = attrsText.match(/\bsrc=["']([^"']+)["']/i);
    if (srcMatch && srcMatch[1]) {
      const src = normalizeRootRelative(String(srcMatch[1] || ""));
      if (src) scriptSrcs.push(src);
      return "";
    }

    const inline = String(content || "").trim();
    if (inline) inlineScripts.push(inline);
    return "";
  });

  return {
    scriptSrcs: Array.from(new Set(scriptSrcs)),
    inlineScripts,
    bodyWithoutScripts,
  };
}

export async function loadLegacyStaticPage(slug: string): Promise<LegacyStaticPageDocument | null> {
  if (!LEGACY_STATIC_PAGE_SLUGS.includes(slug as LegacyStaticPageSlug)) return null;

  const filePath = path.resolve(process.cwd(), "public/legacy/pages", `${slug}.html`);
  const html = await readFile(filePath, "utf8");
  const headMarkup = extractTagContent(html, "head");
  const bodyMarkup = extractTagContent(html, "body");
  const titleMatch = headMarkup.match(/<title>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? String(titleMatch[1] || "").trim() : "Tsebi Brasil";
  const cleaned = rewriteLegacyUrls(stripLegacyChrome(bodyMarkup));
  const { scriptSrcs, inlineScripts, bodyWithoutScripts } = extractScripts(cleaned);

  return {
    title: title || "Tsebi Brasil",
    bodyMarkup: bodyWithoutScripts,
    stylesheetHrefs: extractStylesheetHrefs(headMarkup),
    inlineStyles: extractInlineStyles(headMarkup),
    scriptSrcs,
    inlineScripts,
  };
}
