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
const nextConfig: NextConfig = {
  reactStrictMode: true,
};

export default nextConfig;
