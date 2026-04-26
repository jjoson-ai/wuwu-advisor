"use client";

import { useEffect } from "react";
import Script from "next/script";

import {
  flushQueuedGoogleConversions,
  flushQueuedMetaConversions,
} from "@/lib/paid-media.client";
import { getGoogleAdsId, getMetaPublicPixelId } from "@/lib/paid-media";

const FLUSH_INTERVAL_MS = 1500;

export function PaidMediaBridge() {
  const googleAdsId = getGoogleAdsId();
  const metaPixelId = getMetaPublicPixelId();

  useEffect(() => {
    flushQueuedGoogleConversions();
    flushQueuedMetaConversions();

    const interval = window.setInterval(() => {
      flushQueuedGoogleConversions();
      flushQueuedMetaConversions();
    }, FLUSH_INTERVAL_MS);

    return () => {
      window.clearInterval(interval);
    };
  }, []);

  return (
    <>
      {googleAdsId != null ? (
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
      ) : null}
      {metaPixelId != null ? (
        <Script id="wuwu-meta-pixel" strategy="afterInteractive">
          {`
            !function(f,b,e,v,n,t,s)
            {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
            n.callMethod.apply(n,arguments):n.queue.push(arguments)};
            if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
            n.queue=[];t=b.createElement(e);t.async=!0;
            t.src=v;s=b.getElementsByTagName(e)[0];
            s.parentNode.insertBefore(t,s)}(window, document,'script',
            'https://connect.facebook.net/en_US/fbevents.js');
            fbq('init', '${metaPixelId}');
            fbq('track', 'PageView');
          `}
        </Script>
      ) : null}
    </>
  );
}
