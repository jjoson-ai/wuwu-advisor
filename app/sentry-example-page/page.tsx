"use client";

import { useState } from "react";

export default function SentryExamplePage() {
  const [errorThrown, setErrorThrown] = useState(false);

  function throwTestError() {
    setErrorThrown(true);
    throw new Error("Sentry test error — this is a test page");
  }

  return (
    <main style={{ padding: "2rem" }}>
      <h1>Sentry Example Page</h1>
      <p>
        This is a test page for Sentry integration. Click the button below to
        trigger a client-side error that will be captured by Sentry.
      </p>
      {errorThrown && (
        <p style={{ color: "red" }}>
          Error thrown. Check Sentry dashboard if configured.
        </p>
      )}
      <button
        onClick={throwTestError}
        style={{
          padding: "0.75rem 1.5rem",
          background: "#0d0d0d",
          color: "#fff",
          border: "none",
          borderRadius: "4px",
          cursor: "pointer",
          fontSize: "1rem",
        }}
      >
        Throw Test Error
      </button>
    </main>
  );
}
