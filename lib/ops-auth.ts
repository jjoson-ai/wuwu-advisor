export const OPS_AUTH_COOKIE = "wuwu_ops";

/** 30-day session — operator doesn't need to re-login constantly */
export const OPS_AUTH_COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

/**
 * Returns true if the cookie value matches OPS_SECRET.
 * Call this from middleware (Edge-compatible — no Node-only APIs).
 */
export function isOpsSessionValid(cookieValue: string | undefined): boolean {
  const secret = process.env.OPS_SECRET;
  if (!secret || !cookieValue) return false;
  // Constant-time comparison is unnecessary for an ops dashboard, but
  // trimming prevents accidental whitespace mismatches in env files.
  return cookieValue.trim() === secret.trim();
}
