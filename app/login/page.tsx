"use client";

import { FormEvent, Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSearchParams } from "next/navigation";

import { APP_NAME } from "@/lib/config";
import { PRODUCT_TAGLINE } from "@/lib/brand";
import { trackProductEvent } from "@/lib/client-events";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

type AuthErrorKind =
  | "invalid_credentials"
  | "email_not_confirmed"
  | "user_already_exists"
  | "weak_password"
  | "rate_limited"
  | "generic";

function classifyAuthError(message: string): AuthErrorKind {
  const m = message.toLowerCase();
  if (m.includes("invalid login credentials") || m.includes("invalid_credentials")) {
    return "invalid_credentials";
  }
  if (m.includes("email not confirmed") || m.includes("not confirmed")) {
    return "email_not_confirmed";
  }
  if (
    m.includes("already registered") ||
    m.includes("already been registered") ||
    m.includes("user already exists") ||
    m.includes("user_already_exists")
  ) {
    return "user_already_exists";
  }
  if (m.includes("password") && (m.includes("short") || m.includes("weak"))) {
    return "weak_password";
  }
  if (m.includes("rate limit") || m.includes("too many")) {
    return "rate_limited";
  }
  return "generic";
}

function humanizeAuthError(
  kind: AuthErrorKind,
  mode: "login" | "signup",
  rawMessage: string,
): string {
  switch (kind) {
    case "invalid_credentials":
      return mode === "login"
        ? "We couldn't find an account with that email and password. Double-check your password, or create a new account if this is your first time."
        : "Those credentials didn't work. Please try again.";
    case "email_not_confirmed":
      return "Your email isn't confirmed yet. Check your inbox for the confirmation link, then come back and sign in.";
    case "user_already_exists":
      return "An account with that email already exists. Try signing in instead.";
    case "weak_password":
      return "Password needs at least 8 characters. Try a longer one.";
    case "rate_limited":
      return "Too many attempts. Please wait a minute and try again.";
    default:
      return rawMessage;
  }
}

function LoginPageContent() {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialMode = searchParams.get("mode") === "signup" ? "signup" : "login";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [mode, setMode] = useState<"login" | "signup">(initialMode);
  const [status, setStatus] = useState<string>(searchParams.get("error") ?? "");
  const [errorKind, setErrorKind] = useState<AuthErrorKind | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function setAuthError(rawMessage: string, currentMode: "login" | "signup") {
    const kind = classifyAuthError(rawMessage);
    setErrorKind(kind);
    setStatus(humanizeAuthError(kind, currentMode, rawMessage));
  }

  function clearAuthError() {
    setErrorKind(null);
    setStatus("");
  }

  function switchMode(next: "login" | "signup") {
    setMode(next);
    // Keep email + password so user doesn't retype. Clear only the error.
    clearAuthError();
  }

  async function handleGoogleSignIn() {
    setIsSubmitting(true);
    setErrorKind(null);
    setStatus("Redirecting to Google...");

    try {
      const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent("/dashboard")}`;
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo,
        },
      });

      if (error != null) {
        setAuthError(error.message, mode);
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (mode === "signup" && password !== confirmPassword) {
      setErrorKind("generic");
      setStatus("Passwords do not match.");
      return;
    }

    setIsSubmitting(true);
    setErrorKind(null);
    setStatus("Submitting...");

    try {
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error !== null) {
          setAuthError(error.message, "login");
          return;
        }

        window.location.assign("/dashboard");
        return;
      }

      void trackProductEvent(
        {
          event_name: "signup_started",
          feature: null,
          plan_type: null,
          upgrade_surface: null,
        },
        { onceKey: "signup_started:web" },
      );

      const emailRedirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent("/dashboard")}`;

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo,
        },
      });

      if (error !== null) {
        setAuthError(error.message, "signup");
        return;
      }

      void trackProductEvent({
        event_name: "signup_completed",
        feature: null,
        plan_type: null,
        upgrade_surface: null,
      });

      if (data.session != null) {
        router.replace("/dashboard");
        router.refresh();
        return;
      }

      setStatus(
        "Account created. Check your email to confirm it, then sign in with your password.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  // UX QA 2026-04-26 — restructured for cleaner auth hierarchy:
  // 1. Mode toggle FIRST (sets context — sign in vs. create account)
  // 2. Headline matches the chosen mode
  // 3. Continue with Google (single primary OAuth path)
  // 4. "or" divider
  // 5. Email/password form
  // 6. Status + post-auth disclaimer (no orphan gap)
  // Card is centered (margin: 0 auto) to remove the dead space on the right.

  const heading = mode === "login" ? `Sign in to ${APP_NAME}` : `Create your ${APP_NAME} account`;
  const subhead =
    mode === "login"
      ? "Welcome back. Continue with Google or use your email and password."
      : "Free to start. We just need an email and a password — birth details come next.";

  return (
    <div className="stack">
      <section
        className="card stack"
        style={{ maxWidth: 480, margin: "0 auto", width: "100%" }}
      >
        <div className="stack" style={{ gap: "0.35rem" }}>
          <p className="muted" style={{ margin: 0 }}>
            {PRODUCT_TAGLINE}
          </p>
          <h1 style={{ margin: 0 }}>{heading}</h1>
          <p className="muted" style={{ margin: 0 }}>
            {subhead}
          </p>
        </div>

        {/* Mode toggle FIRST — sets context before user picks an auth method. */}
        <div
          role="tablist"
          aria-label="Authentication mode"
          style={{
            display: "inline-flex",
            background: "var(--surface-raised, rgba(0,0,0,0.06))",
            borderRadius: "9999px",
            padding: "3px",
            gap: "2px",
            alignSelf: "stretch",
          }}
        >
          <button
            role="tab"
            aria-selected={mode === "login"}
            onClick={() => switchMode("login")}
            type="button"
            style={{
              flex: 1,
              padding: "0.5rem 1rem",
              borderRadius: "9999px",
              border: "none",
              cursor: "pointer",
              fontSize: "0.92rem",
              fontWeight: mode === "login" ? 600 : 400,
              background: mode === "login" ? "var(--card-bg, #fff)" : "transparent",
              color: mode === "login" ? "var(--text)" : "var(--text-muted)",
              boxShadow: mode === "login" ? "0 1px 3px rgba(0,0,0,0.12)" : "none",
              transition: "all 0.15s ease",
            }}
          >
            Sign in
          </button>
          <button
            role="tab"
            aria-selected={mode === "signup"}
            onClick={() => switchMode("signup")}
            type="button"
            style={{
              flex: 1,
              padding: "0.5rem 1rem",
              borderRadius: "9999px",
              border: "none",
              cursor: "pointer",
              fontSize: "0.92rem",
              fontWeight: mode === "signup" ? 600 : 400,
              background: mode === "signup" ? "var(--card-bg, #fff)" : "transparent",
              color: mode === "signup" ? "var(--text)" : "var(--text-muted)",
              boxShadow: mode === "signup" ? "0 1px 3px rgba(0,0,0,0.12)" : "none",
              transition: "all 0.15s ease",
            }}
          >
            Create account
          </button>
        </div>

        {/* Primary OAuth path */}
        <button
          className="button secondary"
          disabled={isSubmitting}
          onClick={() => {
            void handleGoogleSignIn();
          }}
          type="button"
          style={{ width: "100%", justifyContent: "center" }}
        >
          {mode === "login" ? "Continue with Google" : "Sign up with Google"}
        </button>

        {/* "or" divider */}
        <div
          aria-hidden
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.75rem",
            color: "var(--text-muted)",
            fontSize: "0.82rem",
          }}
        >
          <span style={{ flex: 1, height: 1, background: "var(--border, rgba(0,0,0,0.1))" }} />
          <span>or use email</span>
          <span style={{ flex: 1, height: 1, background: "var(--border, rgba(0,0,0,0.1))" }} />
        </div>

        <form className="stack" onSubmit={handleSubmit}>
          <label className="field">
            <span>Email</span>
            <input
              autoComplete="email"
              onChange={(event) => setEmail(event.target.value)}
              placeholder="you@example.com"
              required
              type="email"
              value={email}
            />
          </label>

          <label className="field">
            <span>Password</span>
            <input
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              minLength={8}
              onChange={(event) => setPassword(event.target.value)}
              placeholder={mode === "login" ? "Enter your password" : "Choose a password (8+ characters)"}
              required
              type="password"
              value={password}
            />
          </label>

          {mode === "signup" ? (
            <label className="field">
              <span>Confirm password</span>
              <input
                autoComplete="new-password"
                minLength={8}
                onChange={(event) => setConfirmPassword(event.target.value)}
                placeholder="Re-enter your password"
                required
                type="password"
                value={confirmPassword}
              />
            </label>
          ) : null}

          <button className="button" disabled={isSubmitting} type="submit">
            {isSubmitting
              ? "Submitting..."
              : mode === "login"
                ? "Sign in"
                : "Create account"}
          </button>
        </form>

        {/* Status messages — only render when there's something to show.
            Removes the orphan whitespace flagged in UX QA 2026-04-26. */}
        {status !== "" ? (
          <div className="stack" style={{ gap: "0.5rem" }}>
            <p className="muted" style={{ margin: 0 }}>
              {status}
            </p>
            {errorKind === "invalid_credentials" && mode === "login" ? (
              <button
                className="button secondary"
                onClick={() => switchMode("signup")}
                style={{ alignSelf: "flex-start" }}
                type="button"
              >
                Create an account instead
              </button>
            ) : null}
            {errorKind === "user_already_exists" && mode === "signup" ? (
              <button
                className="button secondary"
                onClick={() => switchMode("login")}
                style={{ alignSelf: "flex-start" }}
                type="button"
              >
                Sign in instead
              </button>
            ) : null}
          </div>
        ) : null}

        <p
          className="muted"
          style={{ margin: 0, fontSize: "0.85rem", textAlign: "center" }}
        >
          {mode === "login"
            ? "After signing in you'll land on "
            : "After creating your account you'll set up your chart, then land on "}
          <Link href="/dashboard">Today</Link>.
        </p>
      </section>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="stack">Loading login form...</div>}>
      <LoginPageContent />
    </Suspense>
  );
}
