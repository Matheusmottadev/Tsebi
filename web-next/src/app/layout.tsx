import type { Metadata } from "next";
import { Montserrat, Playfair_Display } from "next/font/google";
import { LayoutChrome } from "@/components/LayoutChrome";
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

export const metadata: Metadata = {
  title: {
    default: "Tsebi Brasil",
    template: "%s | Tsebi Brasil",
  },
  applicationName: "Tsebi Brasil",
  description:
    "Tsebi Brasil: moda autoral com coleções exclusivas, design contemporâneo e acabamento premium.",
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
  metadataBase: resolveMetadataBaseUrl(),
  robots: {
    index: true,
    follow: true,
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
        url: "/images/Gazelalogo.png?v=20260227b",
        type: "image/png",
      },
      {
        url: "/favicon.ico?v=20260227b",
        type: "image/x-icon",
      },
    ],
    shortcut: [{ url: "/favicon.ico?v=20260227b" }],
    apple: [{ url: "/images/Gazelalogo.png?v=20260227b" }],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const organizationSchema = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "Tsebi Brasil",
    url: defaultSiteUrl,
    logo: `${defaultSiteUrl}/images/Gazelalogo.png`,
    sameAs: [],
  };

  return (
    <html lang="pt-BR">
      <body className={`${montserrat.variable} ${playfairDisplay.variable}`}>
        <LayoutChrome>{children}</LayoutChrome>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(organizationSchema),
          }}
        />
      </body>
    </html>
  );
}

