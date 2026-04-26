import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { submitDobAction } from "@/app/age-gate/actions";
import { getCurrentUser, isAgeVerified } from "@/lib/auth";
import { BRAND_NAME } from "@/lib/brand";
import { AGE_GATE_MINIMUM_AGE } from "@/domain/safety/age-gate";

export const metadata: Metadata = {
  title: "Age verification",
  robots: { index: false },
};

type AgeGatePageProps = {
  searchParams: Promise<{ next?: string; error?: string }>;
};

export default async function AgeGatePage({ searchParams }: AgeGatePageProps) {
  const user = await getCurrentUser();

  if (user === null) {
    redirect("/login");
  }

  const { next = "/dashboard", error } = await searchParams;

  if (isAgeVerified(user)) {
    const safePath = next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
    redirect(safePath);
  }

  const submitWithNext = submitDobAction.bind(null, next);

  // Compute a "max" attribute so the browser-native date picker blocks
  // future dates client-side. Server re-validates regardless.
  const todayISO = new Date().toISOString().slice(0, 10);

  const errorMessage = errorMessageFor(error);

  return (
    <div
      className="stack"
      style={{
        minHeight: "100dvh",
        justifyContent: "center",
        alignItems: "center",
        padding: "2rem 1rem",
        maxWidth: "28rem",
        margin: "0 auto",
      }}
    >
      <div className="card card-feature stack" style={{ textAlign: "center" }}>
        <div className="stack" style={{ gap: "0.4rem" }}>
          <p className="card-eyebrow">Age requirement</p>
          <h1 className="section-heading-serif">
            {BRAND_NAME} is for users {AGE_GATE_MINIMUM_AGE} and older
          </h1>
          <p className="card-subtitle">
            Please confirm your date of birth to continue. We use this to
            verify you meet our minimum age requirement.
          </p>
        </div>

        <form action={submitWithNext} className="stack" style={{ gap: "0.75rem" }}>
          <label className="field" style={{ textAlign: "left" }}>
            <span>Date of birth</span>
            <input
              autoComplete="bday"
              max={todayISO}
              name="dob"
              required
              type="date"
            />
          </label>

          {errorMessage !== null ? (
            <p
              className="muted"
              role="alert"
              style={{ margin: 0, color: "var(--color-warning, #b45309)" }}
            >
              {errorMessage}
            </p>
          ) : null}

          <button className="button" style={{ width: "100%" }} type="submit">
            Continue
          </button>
        </form>

        <p className="muted" style={{ margin: 0, fontSize: "0.8rem" }}>
          We discuss finances, relationships, and personal decisions. By
          continuing you confirm you are {AGE_GATE_MINIMUM_AGE} or older.
          Under-{AGE_GATE_MINIMUM_AGE} accounts are removed.
        </p>
      </div>
    </div>
  );
}

function errorMessageFor(error: string | undefined): string | null {
  if (error === "invalid")
    return "Please enter a valid date of birth.";
  if (error === "future")
    return "Date of birth cannot be in the future.";
  return null;
}
