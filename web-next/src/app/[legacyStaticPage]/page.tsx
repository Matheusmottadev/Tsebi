import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LegacyStaticPageRenderer } from "@/components/LegacyStaticPageRenderer";
import {
  LEGACY_STATIC_PAGE_SLUGS,
  type LegacyStaticPageSlug,
  loadLegacyStaticPage,
} from "@/lib/legacy-static-pages";

type LegacyStaticPageParams = {
  legacyStaticPage: string;
};

type LegacyStaticPageProps = {
  params: Promise<LegacyStaticPageParams>;
};

export async function generateStaticParams() {
  return LEGACY_STATIC_PAGE_SLUGS.map((slug) => ({ legacyStaticPage: slug }));
}

export async function generateMetadata({ params }: LegacyStaticPageProps): Promise<Metadata> {
  const resolved = await params;
  const slug = String(resolved?.legacyStaticPage || "").trim();
  const page = await loadLegacyStaticPage(slug);
  if (!page) return {};
  return {
    title: page.title,
    alternates: { canonical: `/${slug}` },
  };
}

export default async function LegacyStaticPage({ params }: LegacyStaticPageProps) {
  const resolved = await params;
  const slug = String(resolved?.legacyStaticPage || "").trim();
  const page = await loadLegacyStaticPage(slug as LegacyStaticPageSlug);
  if (!page) notFound();

  return (
    <LegacyStaticPageRenderer
      stylesheetHrefs={page.stylesheetHrefs}
      inlineStyles={page.inlineStyles}
      bodyMarkup={page.bodyMarkup}
      scriptSrcs={page.scriptSrcs}
      inlineScripts={page.inlineScripts}
    />
  );
}

