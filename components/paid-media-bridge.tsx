"use client";

import { useEffect } from "react";
import Script from "next/script";

import {
  flushQueuedGoogleConversions,
} from "@/lib/paid-media.client";
import { getGoogleAdsId } from "@/lib/paid-media";

export function PaidMediaBridge() {
  const googleAdsId = getGoogleAdsId();

  useEffect(() => {
    flushQueuedGoogleConversions();

    const interval = window.setInterval(() => {
      flushQueuedGoogleConversions();
    }, 1500);

    return () => {
      window.clearInterval(interval);
    };
  }, []);

  if (googleAdsId == null) {
    return null;
  }

  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(googleAdsId)}`}
        strategy="afterInteractive"
      />
      <Script id="wuwu-google-ads" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){window.dataLayer.push(arguments);}
          window.gtag = gtag;
          gtag('js', new Date());
          gtag('config', '${googleAdsId}');
        `}
      </Script>
    </>
  );
}
