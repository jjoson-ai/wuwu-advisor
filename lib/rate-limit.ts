/**
 * Upstash Redis–backed rate limiting.
 *
 * Two limiters:
 *   authRatelimit       — 20 POST attempts / 15 min / IP  (ops login brute-force)
 *   generationRatelimit — 30 requests / hour / user-id    (LLM cost cap, all SSE routes)
 *
 * Edge-compatible: uses @upstash/redis (fetch-based HTTP client) — no Node.js
 * crypto, streams, or net. Works in both middleware (Edge) and API routes (Node).
 *
 * Configuration:
 *   UPSTASH_REDIS_REST_URL   — Upstash REST endpoint
 *   UPSTASH_REDIS_REST_TOKEN — Upstash REST token
 *   RATE_LIMIT_DISABLED=true — bypass all checks (for local dev / test)
 *
 * Both limiters fail-open: if Redis is unreachable the request is allowed and
 * the error is logged. This ensures an Upstash outage never takes down the app.
 * Auth brute-force protection is a best-effort defence, not a hard dependency.
 *
 * Lazy singletons: Redis client and Ratelimit instances are created on first
 * use rather than at module load time, so build-time env-var absence doesn't
 * cause failures.
 */

import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

/** Skip all checks — set RATE_LIMIT_DISABLED=true in .env.local. */
function isDisabled(): boolean {
  return process.env.RATE_LIMIT_DISABLED === "true";
}

/** True when both required env vars are present and non-empty. */
function isConfigured(): boolean {
  return (
    typeof process.env.UPSTASH_REDIS_REST_URL === "string" &&
    process.env.UPSTASH_REDIS_REST_URL !== "" &&
    typeof process.env.UPSTASH_REDIS_REST_TOKEN === "string" &&
    process.env.UPSTASH_REDIS_REST_TOKEN !== ""
  );
}

// ---------------------------------------------------------------------------
// Lazy singletons
// ---------------------------------------------------------------------------

let _redis: Redis | null = null;
let _authLimiter: Ratelimit | null = null;
let _genLimiter: Ratelimit | null = null;

function getRedis(): Redis {
  if (_redis === null) {
    _redis = Redis.fromEnv();
  }
  return _redis;
}

/** 20 POST attempts per 15-minute sliding window per IP. */
function getAuthLimiter(): Ratelimit {
  if (_authLimiter === null) {
    _authLimiter = new Ratelimit({
      redis: getRedis(),
      limiter: Ratelimit.slidingWindow(20, "15 m"),
      prefix: "rl:auth",
      analytics: false,
    });
  }
  return _authLimiter;
}

/** 30 generation requests per hour per user-id (all SSE routes combined). */
function getGenLimiter(): Ratelimit {
  if (_genLimiter === null) {
    _genLimiter = new Ratelimit({
      redis: getRedis(),
      limiter: Ratelimit.slidingWindow(30, "1 h"),
      prefix: "rl:gen",
      analytics: false,
    });
  }
  return _genLimiter;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export type RateLimitResult =
  | { allowed: true }
  | { allowed: false; retryAfter: number };

/**
 * Ops-dashboard brute-force protection.
 * Call before processing each login POST. Keyed by IP address.
 * Fails-open: Redis errors are logged and the request is allowed through.
 */
export async function checkAuthRateLimit(ip: string): Promise<RateLimitResult> {
  if (isDisabled() || !isConfigured()) return { allowed: true };
  try {
    const { success, reset } = await getAuthLimiter().limit(ip);
    if (!success) {
      return { allowed: false, retryAfter: Math.ceil((reset - Date.now()) / 1000) };
    }
    return { allowed: true };
  } catch (error) {
    console.error("[rate-limit] auth check error — failing open:", error);
    return { allowed: true };
  }
}

/**
 * LLM generation cost cap.
 * Call after auth validation, before the expensive generation pipeline.
 * Applies to ALL users (including Pro) — this is a cost cap, not a feature gate.
 * Keyed by user-id across all SSE generation routes combined.
 * Fails-open: Redis errors are logged and the request is allowed through.
 */
export async function checkGenerationRateLimit(userId: string): Promise<RateLimitResult> {
  if (isDisabled() || !isConfigured()) return { allowed: true };
  try {
    const { success, reset } = await getGenLimiter().limit(userId);
    if (!success) {
      return { allowed: false, retryAfter: Math.ceil((reset - Date.now()) / 1000) };
    }
    return { allowed: true };
  } catch (error) {
    console.error("[rate-limit] generation check error — failing open:", error);
    return { allowed: true };
  }
}
