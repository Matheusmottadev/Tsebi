"use client";

import { useEffect, useMemo, useState } from "react";
import Script from "next/script";
import posthog from "posthog-js";
import { CONSENT_EVENT, type ConsentState, readStoredConsent } from "@/components/CookieConsentBar";
import { getOrCreateAnonId } from "@/lib/analytics";

const GA_MEASUREMENT_ID = String(process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID || "").trim();
const GTM_ID = String(process.env.NEXT_PUBLIC_GTM_ID || "").trim();
const GOOGLE_ADS_ID = String(process.env.NEXT_PUBLIC_GOOGLE_ADS_ID || "").trim();
const POSTHOG_KEY = String(process.env.NEXT_PUBLIC_POSTHOG_KEY || "").trim();
const POSTHOG_HOST = String(process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com").trim();

export function TrackingScripts() {
  const [consent, setConsent] = useState<ConsentState | null>(null);
  const allowAnalytics = Boolean(consent?.analytics);
  const allowAds = Boolean(consent?.ads);

  useEffect(() => {
    setConsent(readStoredConsent());

    const onConsentUpdated = (event: Event) => {
      const customEvent = event as CustomEvent<ConsentState>;
      if (customEvent.detail) {
        setConsent(customEvent.detail);
        return;
      }
      setConsent(readStoredConsent());
    };

    window.addEventListener(CONSENT_EVENT, onConsentUpdated);
    return () => window.removeEventListener(CONSENT_EVENT, onConsentUpdated);
  }, []);

  useEffect(() => {
    if (!allowAnalytics) return;
    if (!POSTHOG_KEY) return;
    if (posthog.__loaded) return;
    const anonId = getOrCreateAnonId();
    posthog.init(POSTHOG_KEY, {
      api_host: POSTHOG_HOST,
      person_profiles: "identified_only",
      persistence: "localStorage+cookie",
      autocapture: true,
      capture_pageview: true,
      loaded: (instance) => {
        instance.register({ anon_id: anonId });
      },
    });
  }, [allowAnalytics]);

  const shouldLoadGtag = useMemo(() => {
    if (!allowAnalytics && !allowAds) return false;
    return Boolean(GA_MEASUREMENT_ID || GOOGLE_ADS_ID);
  }, [allowAds, allowAnalytics]);

  const gtagBootstrapId = useMemo(() => {
    if (GA_MEASUREMENT_ID) return GA_MEASUREMENT_ID;
    return GOOGLE_ADS_ID;
  }, []);

  if (!allowAnalytics && !allowAds) return null;

  return (
    <>
      {shouldLoadGtag ? (
        <>
          <Script
            id="gtag-loader"
            src={`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(gtagBootstrapId)}`}
            strategy="afterInteractive"
          />
          <Script id="gtag-init" strategy="afterInteractive">
            {`
              window.dataLayer = window.dataLayer || [];
              function gtag(){window.dataLayer.push(arguments);}
              window.gtag = window.gtag || gtag;
              gtag('js', new Date());
              ${GA_MEASUREMENT_ID ? `gtag('config', '${GA_MEASUREMENT_ID}', { anonymize_ip: true });` : ""}
              ${allowAds && GOOGLE_ADS_ID ? `gtag('config', '${GOOGLE_ADS_ID}');` : ""}
            `}
          </Script>
        </>
      ) : null}

      {allowAnalytics && GTM_ID ? (
        <Script id="gtm-loader" strategy="afterInteractive">
          {`
            (function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
            new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
            j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
            'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
            })(window,document,'script','dataLayer','${GTM_ID}');
          `}
        </Script>
      ) : null}
    </>
  );
}
