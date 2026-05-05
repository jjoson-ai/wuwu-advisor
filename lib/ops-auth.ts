export const OPS_AUTH_COOKIE = "wuwu_ops";

/** 30-day session — operator doesn't need to re-login constantly */
export const OPS_AUTH_COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

const OPS_SESSION_HMAC_MESSAGE = "wuwu_ops_session_v1";

function timingSafeEqualString(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

async function computeOpsSessionHmac(secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(OPS_SESSION_HMAC_MESSAGE),
  );
  const bytes = new Uint8Array(signature);
  let hex = "";
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, "0");
  }
  return hex;
}

/**
 * Returns true when the supplied password matches OPS_SECRET. Used by the
 * /api/ops/auth login form handler to verify the typed password. Uses a
 * constant-time string compare to avoid timing side-channels.
 */
export function isOpsPasswordCorrect(password: string | undefined): boolean {
  const secret = process.env.OPS_SECRET;
  if (!secret || !password) return false;
  return timingSafeEqualString(password.trim(), secret.trim());
}

/**
 * Returns the cookie value to set after a successful ops login. The cookie
 * stores HMAC-SHA256(OPS_SECRET, "wuwu_ops_session_v1") as a hex string —
 * never the raw OPS_SECRET. Edge-compatible (Web Crypto API).
 */
export async function getOpsSessionCookieValue(): Promise<string> {
  const secret = process.env.OPS_SECRET;
  if (!secret) {
    throw new Error("OPS_SECRET is not configured.");
  }
  return computeOpsSessionHmac(secret.trim());
}

/**
 * Returns true when a request cookie is a valid ops session. Computes the
 * expected HMAC and constant-time compares against the supplied cookie value.
 * Edge-compatible — call from middleware (no Node-only APIs).
 */
export async function isOpsSessionValid(
  cookieValue: string | undefined,
): Promise<boolean> {
  const secret = process.env.OPS_SECRET;
  if (!secret || !cookieValue) return false;
  const expected = await computeOpsSessionHmac(secret.trim());
  return timingSafeEqualString(cookieValue.trim(), expected);
}
