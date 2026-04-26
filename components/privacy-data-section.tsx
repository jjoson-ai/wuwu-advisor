"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import {
  readTrackingPreference,
  writeTrackingPreference,
} from "@/lib/tracking-preferences";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export function PrivacyDataSection() {
  const router = useRouter();
  const [trackingEnabled, setTrackingEnabled] = useState(false);
  const [status, setStatus] = useState<string>("");
  const [isSubmittingDelete, setIsSubmittingDelete] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  useEffect(() => {
    const saved = readTrackingPreference();

    if (saved !== null) {
      setTrackingEnabled(saved.trackingEnabled);
    }
  }, []);

  async function handleDeleteConfirmed() {
    setIsSubmittingDelete(true);
    setConfirmDeleteOpen(false);
    setStatus("");

    try {
      const response = await fetch("/api/account/delete-request", {
        method: "POST",
      });
      const payload = (await response.json()) as { error?: string; message?: string };

      if (response.ok === false) {
        throw new Error(payload.error || "Unable to delete account.");
      }

      // Sign out locally, then redirect to home. The auth session is now invalid
      // because the account no longer exists in Supabase.
      const supabase = getSupabaseBrowserClient();
      await supabase.auth.signOut();
      router.push("/?deleted=1");
    } catch (error) {
      setStatus(
        error instanceof Error ? error.message : "Unable to delete account.",
      );
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
          <span>AI data handling</span>
          <small className="muted">
            Your questions are sent pseudonymised (using an internal ID, not your
            email) to Anthropic to generate responses. Our agreement with Anthropic
            prohibits using API data to train their models.{" "}
            <a href="/privacy" className="muted">
              See subprocessors &amp; privacy policy
            </a>
            .
          </small>
        </div>

        <div className="field">
          <span>Things Wuwu remembers</span>
          <small className="muted">
            Wuwu extracts durable facts from your Ask conversations to personalise
            future responses. You can view, delete individual facts, or delete
            everything at any time.
          </small>
          <a className="button secondary" href="/privacy/facts">
            View &amp; manage
          </a>
        </div>

        <div className="field">
          <span>Data rights</span>
          <small className="muted">
            Download covers first-party app data. Account deletion is immediate and
            permanent — all your data will be removed. Some billing records may be
            retained to satisfy legal obligations.
          </small>
          <div className="row">
            <a className="button secondary" href="/api/account/export">
              Download my data
            </a>
            {confirmDeleteOpen ? (
              <div className="stack" style={{ gap: "0.4rem" }}>
                <p className="muted" style={{ margin: 0, fontSize: "0.9rem" }}>
                  This will permanently delete your account and all your data. This
                  cannot be undone.
                </p>
                <div className="row">
                  <button
                    className="button danger"
                    disabled={isSubmittingDelete}
                    onClick={() => {
                      void handleDeleteConfirmed();
                    }}
                    type="button"
                  >
                    {isSubmittingDelete ? "Deleting..." : "Yes, delete everything"}
                  </button>
                  <button
                    className="button secondary"
                    disabled={isSubmittingDelete}
                    onClick={() => setConfirmDeleteOpen(false)}
                    type="button"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                className="button secondary"
                disabled={isSubmittingDelete}
                onClick={() => {
                  setConfirmDeleteOpen(true);
                  setStatus("");
                }}
                type="button"
              >
                Delete my account
              </button>
            )}
          </div>
        </div>
      </div>

      <p className="muted" style={{ margin: 0, minHeight: "1.5rem" }}>
        {status}
      </p>
    </section>
  );
}
