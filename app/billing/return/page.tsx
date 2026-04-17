"use client";

import { useEffect, useMemo, useState } from "react";

import { getSupabaseBrowserClient } from "@/lib/supabase/client";

const SESSION_WAIT_TIMEOUT_MS = 15_000;
const SESSION_POLL_INTERVAL_MS = 500;

function sanitizeReturnPath(value: string | null) {
  if (value == null || value.trim() === "") {
    return "/dashboard";
  }

  const normalized = value.trim();

  if (normalized.startsWith("/") === false || normalized.startsWith("//")) {
    return "/dashboard";
  }

  return normalized;
}

function appendQueryParam(path: string, key: string, value: string) {
  const baseUrl = new URL(path, "https://wuwu.local");
  baseUrl.searchParams.set(key, value);
  return `${baseUrl.pathname}${baseUrl.search}`;
}

function sleep(ms: number) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

export default function BillingReturnPage() {
  const [status, setStatus] = useState(
    "We’re verifying your payment. Pro access should activate within a few minutes. If it doesn’t, please contact support.",
  );
  const [diagnostics, setDiagnostics] = useState<string[]>([]);
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);

  useEffect(() => {
    let cancelled = false;

    async function finalizeUpgrade() {
      const browserSearchParams = new URLSearchParams(window.location.search);
      const targetPath = appendQueryParam(
        sanitizeReturnPath(browserSearchParams.get("next")),
        "upgraded",
        "1",
      );
      const startedAt = Date.now();
      const origin = window.location.origin;

      console.info("[Billing] Browser return handoff started.", {
        origin,
        targetPath,
      });
      setDiagnostics([
        `Origin: ${origin}`,
        `Target: ${targetPath}`,
        "Browser session present: checking...",
      ]);

      while (cancelled === false && Date.now() - startedAt < SESSION_WAIT_TIMEOUT_MS) {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        const hasSession = session?.user != null;

        setDiagnostics([
          `Origin: ${origin}`,
          `Target: ${targetPath}`,
          `Browser session present: ${hasSession}`,
        ]);

        if (hasSession) {
          console.info("[Billing] Browser return handoff recovered session.", {
            origin,
            userId: session?.user.id ?? null,
            targetPath,
          });
          setStatus("Upgrade confirmed. Returning to your app...");
          await sleep(300);
          window.location.assign(targetPath);
          return;
        }

        await sleep(SESSION_POLL_INTERVAL_MS);
      }

      const loginPath = `/login?error=${encodeURIComponent(
        "Sign in again to finish upgrading.",
      )}`;
      console.warn("[Billing] Browser return handoff fell back to login.", {
        origin,
        targetPath,
        fallbackReason: "no_browser_session_after_timeout",
      });
      setDiagnostics([
        `Origin: ${origin}`,
        `Target: ${targetPath}`,
        "Browser session present: false",
        "Fallback: no_browser_session_after_timeout",
      ]);
      window.location.assign(loginPath);
    }

    void finalizeUpgrade();

    return () => {
      cancelled = true;
    };
  }, [supabase]);

  return (
    <div className="stack">
      <section className="card stack" style={{ maxWidth: 560 }}>
        <h1 style={{ margin: 0 }}>Finalizing your upgrade</h1>
        <p className="muted" style={{ margin: 0 }}>
          {status}
        </p>
        {process.env.NODE_ENV !== "production" ? (
          <pre
            className="muted"
            style={{
              margin: 0,
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              fontFamily: "var(--font-mono, monospace)",
              fontSize: "0.8rem",
            }}
          >
            {diagnostics.join("\n")}
          </pre>
        ) : null}
      </section>
    </div>
  );
}
