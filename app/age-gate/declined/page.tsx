import type { Metadata } from "next";
import Link from "next/link";

import { AGE_GATE_MINIMUM_AGE } from "@/domain/safety/age-gate";
import { BRAND_NAME } from "@/lib/brand";

export const metadata: Metadata = {
  title: "Age requirement not met",
  robots: { index: false },
};

export default function AgeGateDeclinedPage() {
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
          <h1 className="section-heading-serif">
            {BRAND_NAME} requires users to be {AGE_GATE_MINIMUM_AGE} or older
          </h1>
          <p className="card-subtitle">
            Your account has been removed. We discuss finances, relationships,
            and major life decisions, so we admit only adults. If you believe
            this is an error, please contact support.
          </p>
        </div>

        <Link className="button secondary" href="/">
          Back to homepage
        </Link>
      </div>
    </div>
  );
}
