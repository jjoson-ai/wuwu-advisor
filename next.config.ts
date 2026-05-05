import type { NextConfig } from "next";

/**
 * CORS posture (audit 1.8, 2025-05):
 *
 * No explicit CORS headers are configured because no cross-origin browser
 * clients consume these APIs:
 *
 *   - Web routes (/api/*): same-origin — the Next.js server serves both the
 *     React frontend and the API. Browser same-origin policy applies by default.
 *   - Mobile routes (/api/mobile/*): called from Expo (React Native) via
 *     Bearer-token fetch. Native HTTP clients are not subject to browser CORS.
 *   - Stripe webhook (/api/stripe/webhook): server-to-server, no browser involved.
 *
 * If a third-party web client or a separate frontend domain is introduced,
 * add explicit Access-Control-Allow-Origin headers via middleware or
 * next.config.ts `headers()` — do NOT use `*` wildcard with credentialed
 * requests.
 */

/**
 * Security headers (Gate 1.2, 2026-05-05):
 *
 * Defense-in-depth web hardening before Stripe live-mode flip. Six headers,
 * each scoped to the actual third-party usage in this codebase as of writing:
 *
 *   - Stripe Checkout: server-redirect flow only. No client-side Stripe.js
 *     is loaded by this app, so script-src / frame-src do NOT need
 *     js.stripe.com. form-action permits the redirect to checkout.stripe.com.
 *   - Google Ads tag (paid-media-bridge.tsx): script + connect to
 *     googletagmanager.com + google-analytics.com.
 *   - Meta Pixel (paid-media-bridge.tsx): script + connect to
 *     connect.facebook.net + www.facebook.com.
 *   - Supabase: connect-src (HTTP + WSS realtime channel).
 *   - Vercel Live preview comments: only in non-prod, but allowing on prod
 *     is harmless and avoids CSP noise during preview deploys.
 *
 * `'unsafe-inline'` is required for `script-src` because Next.js App Router
 * emits inline hydration scripts. A nonce-based CSP requires per-request
 * middleware nonce injection — a non-trivial refactor we'll do in a later
 * gate. `'unsafe-eval'` is required by some bundled libraries; revisit
 * post-launch with a tighter audit.
 *
 * `frame-ancestors 'none'` + `X-Frame-Options: DENY` defence-in-depth — the
 * latter is for older browsers that don't honor frame-ancestors.
 *
 * If you add a new third-party script (analytics, ads, video embeds, etc.),
 * update both `script-src` AND `connect-src` here, then verify in browser
 * DevTools that no CSP violations appear in the console.
 */
const cspDirectives = [
  "default-src 'self'",
  // Inline needed for Next.js hydration; revisit with nonce-based CSP later.
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.googletagmanager.com https://connect.facebook.net",
  // Inline styles needed for styled-jsx and inline style props.
  "style-src 'self' 'unsafe-inline'",
  // data: + blob: for inline SVG icons and dynamically-generated previews.
  // https: open for user-uploaded avatars and any hotlinked images we may
  // surface — tighten post-launch once the surface is fully audited.
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  // Supabase REST + realtime, plus the analytics/ads pixels.
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://www.googletagmanager.com https://www.google-analytics.com https://connect.facebook.net https://www.facebook.com",
  // We do not embed any third-party iframes into the app.
  "frame-src 'self'",
  // Defense-in-depth alongside X-Frame-Options.
  "frame-ancestors 'none'",
  "base-uri 'self'",
  // Stripe Checkout redirect lands here.
  "form-action 'self' https://checkout.stripe.com",
  "object-src 'none'",
  "upgrade-insecure-requests",
].join("; ");

const securityHeaders = [
  {
    key: "Content-Security-Policy",
    value: cspDirectives,
  },
  {
    // 2 years, include subdomains, eligible for HSTS preload list.
    // https://hstspreload.org — submit wuwu-advisor.com after live-mode flip.
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  {
    key: "X-Frame-Options",
    value: "DENY",
  },
  {
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    // Disable browser features we don't use; locks down feature exposure.
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=(self), usb=(), magnetometer=(), accelerometer=(), gyroscope=()",
  },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async headers() {
    return [
      {
        // Apply to all routes. Webhook + API routes don't render in a browser
        // so the headers are inert there, but also harmless.
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
