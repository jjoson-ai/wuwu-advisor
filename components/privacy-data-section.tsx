"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import {
  readTrackingPreference,
  writeTrackingPreference,
} from "@/lib/tracking-preferences";

export function PrivacyDataSection() {
  const [trackingEnabled, setTrackingEnabled] = useState(false);
  const [status, setStatus] = useState<string>("");
  const [isSubmittingDelete, setIsSubmittingDelete] = useState(false);

  useEffect(() => {
    const saved = readTrackingPreference();

    if (saved !== null) {
      setTrackingEnabled(saved.trackingEnabled);
    }
  }, []);

  async function handleDeleteRequest() {
    setIsSubmittingDelete(true);
    setStatus("");

    try {
      const response = await fetch("/api/account/delete-request", {
        method: "POST",
      });
      const payload = (await response.json()) as { error?: string; message?: string };

      if (response.ok === false) {
        throw new Error(payload.error || "Unable to submit deletion request.");
      }

      setStatus(
        payload.message ||
          "Deletion request received. A team member will process it manually. This can take up to 30 days, and some billing records may be retained to satisfy legal obligations.",
      );
    } catch (error) {
      setStatus(
        error instanceof Error ? error.message : "Unable to submit deletion request.",
      );
    } finally {
      setIsSubmittingDelete(false);
    }
  }

  return (
    <section className="card card-feature stack">
      <div className="form-section-header">
        <p className="card-eyebrow">Privacy and data</p>
        <h2 className="section-heading-serif">Privacy &amp; data</h2>
        <p className="card-subtitle">
          Manage the legal references, data rights entry points, and device-level
          tracking preference for this account.
        </p>
      </div>

      <div className="form-section">
        <div className="page-actions">
          <Link className="button secondary" href="/privacy">
            Privacy Policy
          </Link>
          <Link className="button secondary" href="/terms">
            Terms
          </Link>
        </div>

        <div className="field">
          <span>Allow anonymised usage analytics</span>
          <small className="muted">
          Optional analytics are not active in the current build. This preference
          is stored in this browser only so it can stay off if optional analytics
          are added later.
          </small>
          <label className="checkbox-row">
            <input
              checked={trackingEnabled}
              onChange={(event) => {
                const nextValue = event.target.checked;

                setTrackingEnabled(nextValue);
                writeTrackingPreference(nextValue);
                setStatus("Tracking preference saved on this device.");
              }}
              type="checkbox"
            />
            <span>Allow anonymised usage analytics</span>
          </label>
        </div>

        <div className="field">
          <span>Data rights</span>
          <small className="muted">
            Download covers first-party app data in the current build. Deletion is
            manual and may take up to 30 days, and some billing records will be
            retained to satisfy legal obligations.
          </small>
          <div className="row">
            <a className="button secondary" href="/api/account/export">
              Download my data
            </a>
            <button
              className="button secondary"
              disabled={isSubmittingDelete}
              onClick={() => {
                void handleDeleteRequest();
              }}
              type="button"
            >
              {isSubmittingDelete ? "Submitting..." : "Delete my account"}
            </button>
          </div>
        </div>
      </div>

      <p className="muted" style={{ margin: 0, minHeight: "1.5rem" }}>
        {status}
      </p>
    </section>
  );
}
