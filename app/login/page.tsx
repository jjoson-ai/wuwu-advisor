"use client";

import { FormEvent, Suspense, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSearchParams } from "next/navigation";

import { APP_NAME } from "@/lib/config";
import { PRODUCT_TAGLINE } from "@/lib/brand";
import { trackProductEvent } from "@/lib/client-events";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

function LoginPageContent() {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [status, setStatus] = useState<string>(searchParams.get("error") ?? "");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleGoogleSignIn() {
    setIsSubmitting(true);
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
        setStatus(error.message);
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (mode === "signup" && password !== confirmPassword) {
      setStatus("Passwords do not match.");
      return;
    }

    setIsSubmitting(true);
    setStatus("Submitting...");

    try {
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (error !== null) {
          setStatus(error.message);
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

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
      });

      if (error !== null) {
        setStatus(error.message);
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

  return (
    <div className="stack">
      <section className="card stack" style={{ maxWidth: 560 }}>
        <div className="stack" style={{ gap: "0.35rem" }}>
          <p className="muted" style={{ margin: 0 }}>
            {PRODUCT_TAGLINE}
          </p>
          <h1 style={{ margin: 0 }}>Sign in to {APP_NAME}</h1>
          <p className="muted" style={{ margin: 0 }}>
            Use your email and password to access your Briefing, Signals, Timing,
            and Guidance.
          </p>
        </div>

        <div className="row">
          <button
            className="button secondary"
            disabled={isSubmitting}
            onClick={() => {
              void handleGoogleSignIn();
            }}
            type="button"
          >
            Continue with Google
          </button>
        </div>

        <div className="row">
          <button
            className={mode === "login" ? "button" : "button secondary"}
            onClick={() => setMode("login")}
            type="button"
          >
            Login
          </button>
          <button
            className={mode === "signup" ? "button" : "button secondary"}
            onClick={() => setMode("signup")}
            type="button"
          >
            Sign up
          </button>
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
              placeholder="Enter your password"
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

        <p className="muted" style={{ margin: 0, minHeight: "1.5rem" }}>
          {status}
        </p>

        <p className="muted" style={{ margin: 0 }}>
          After authentication, you will land on <Link href="/dashboard">Today</Link>.
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
