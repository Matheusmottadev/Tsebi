import type { Metadata, Viewport } from "next";
import { Cormorant_Garamond, Jost, Montserrat, Playfair_Display } from "next/font/google";
import Script from "next/script";
import { Suspense } from "react";
import { LayoutChrome } from "@/components/LayoutChrome";
import { CookieConsentBar } from "@/components/CookieConsentBar";
import { IdentityBridge } from "@/components/IdentityBridge";
import { MetaPixelBase } from "@/components/MetaPixelBase";
import { MetaPixelPageViewTracker } from "@/components/MetaPixelPageViewTracker";
import { WhatsAppContactButton } from "@/components/WhatsAppContactButton";
import { TrackingScripts } from "@/components/TrackingScripts";
import { PwaInstallPrompt } from "@/components/PwaInstallPrompt";
import { PwaUpdateBanner } from "@/components/PwaUpdateBanner";
import { PwaPushPrompt } from "@/components/PwaPushPrompt";
import { PwaSplashScreen } from "@/components/PwaSplashScreen";
import "./globals.css";
import "@/styles/legacy/design-tokens.css";
import "@/styles/legacy/primitives.css";
import "@/styles/legacy/genesis.css";
import "@/styles/legacy/style.css";

const montserrat = Montserrat({
  variable: "--font-montserrat",
  weight: ["300", "400", "500", "600", "700"],
  subsets: ["latin"],
});

const playfairDisplay = Playfair_Display({
  variable: "--font-playfair",
  weight: ["400", "500", "600", "700"],
  subsets: ["latin"],
});

const cormorant = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["300", "400"],
  style: ["normal", "italic"],
  variable: "--font-cormorant",
});

const jost = Jost({
  subsets: ["latin"],
  weight: ["200", "300", "400"],
  variable: "--font-jost",
});

const defaultSiteUrl = "https://tsebi.com.br";

function resolveMetadataBaseUrl(): URL {
  const raw = String(process.env.NEXT_PUBLIC_SITE_URL || "").trim();
  if (!raw) return new URL(defaultSiteUrl);

  try {
    return new URL(raw);
  } catch {
    return new URL(defaultSiteUrl);
  }
}

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#111111" },
  ],
  width: "device-width",
  initialScale: 1,
  minimumScale: 1,
};

export const metadata: Metadata = {
  title: {
    default: "Tsebi Brasil",
    template: "%s | Tsebi Brasil",
  },
  applicationName: "Tsebi Brasil",
  category: "fashion",
  creator: "Tsebi Brasil",
  publisher: "Tsebi Brasil",
  metadataBase: resolveMetadataBaseUrl(),
  alternates: {
    canonical: "/",
    languages: {
      "pt-BR": "/",
    },
  },
  description:
    "Tsebi Brasil: moda autoral com coleções exclusivas, design contemporâneo e acabamento premium.",
  referrer: "origin-when-cross-origin",
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  authors: [{ name: "Tsebi Brasil", url: defaultSiteUrl }],
  keywords: [
    "tsebi",
    "tsebi brasil",
    "moda feminina",
    "moda masculina",
    "roupas premium",
    "alfaiataria",
    "Coleção Genesis",
    "ecommerce de moda",
  ],
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  openGraph: {
    locale: "pt_BR",
    type: "website",
    title: "Tsebi Brasil",
    description:
      "Tsebi Brasil: moda autoral com coleções exclusivas, design contemporâneo e acabamento premium.",
    url: "/",
    siteName: "Tsebi Brasil",
    images: [
      {
        url: "/images/Gazelalogo.png",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Tsebi Brasil",
    description:
      "Tsebi Brasil: moda autoral com coleções exclusivas, design contemporâneo e acabamento premium.",
    images: ["/images/Gazelalogo.png"],
  },
  icons: {
    icon: [
      {
        url: "/images/Gazelalogo-round-256.png?v=20260304b",
        type: "image/png",
      },
      {
        url: "/images/Gazelalogo-round-256.png?v=20260304b",
        type: "image/x-icon",
      },
    ],
    shortcut: [{ url: "/images/Gazelalogo-round-256.png?v=20260304b" }],
    apple: [
      { url: "/images/pwa-192.png", sizes: "192x192", type: "image/png" },
      { url: "/images/pwa-512.png", sizes: "512x512", type: "image/png" },
    ],
  },
  appleWebApp: {
    capable: true,
    title: "Tsebi Brasil",
    statusBarStyle: "black-translucent",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const isProduction = process.env.NODE_ENV === "production";
  const organizationSchema = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "Tsebi Brasil",
    url: defaultSiteUrl,
    logo: `${defaultSiteUrl}/images/Gazelalogo.png`,
    sameAs: [],
  };
  const websiteSchema = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "Tsebi Brasil",
    url: defaultSiteUrl,
    potentialAction: {
      "@type": "SearchAction",
      target: `${defaultSiteUrl}/products?q={search_term_string}`,
      "query-input": "required name=search_term_string",
    },
  };

  return (
    <html
      lang="pt-BR"
      suppressHydrationWarning
      className={`${montserrat.variable} ${playfairDisplay.variable} ${cormorant.variable} ${jost.variable}`}
    >
      <head>
        <link rel="manifest" href="/manifest.webmanifest" />
        {isProduction ? <MetaPixelBase /> : null}
      </head>
      <body
        suppressHydrationWarning
        style={{ margin: 0, padding: 0 }}
      >
        <Script id="google-consent-default" strategy="beforeInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){window.dataLayer.push(arguments);}
            window.gtag = window.gtag || gtag;
            gtag('consent', 'default', {
              ad_storage: 'denied',
              ad_user_data: 'denied',
              ad_personalization: 'denied',
              analytics_storage: 'denied',
              functionality_storage: 'granted',
              personalization_storage: 'denied',
              security_storage: 'granted',
              wait_for_update: 500
            });
          `}
        </Script>
        {isProduction ? <MetaPixelPageViewTracker /> : null}
        {isProduction ? <TrackingScripts /> : null}
        <PwaSplashScreen />
        <WhatsAppContactButton />
        <PwaInstallPrompt />
        <PwaPushPrompt />
        <PwaUpdateBanner />
        <IdentityBridge />
        <Suspense fallback={null}>
          <LayoutChrome>{children}</LayoutChrome>
        </Suspense>
        <CookieConsentBar />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(organizationSchema),
          }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(websiteSchema),
          }}
        />
      </body>
    </html>
  );
}

