"use client";

import { useMemo, useState } from "react";

import {
  REVISIT_PRESETS,
  type DecisionLogRow,
} from "@/domain/decision/decision-log.types";

type Props = {
  decisionGuidanceId: string;
  existingLog: DecisionLogRow | null;
};

type SaveStatus = "idle" | "saving" | "saved" | "error";

/** ISO date string for N days from today, in local time. */
function localDateInDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10); // "YYYY-MM-DD"
}

export function DecisionLogForm({ decisionGuidanceId, existingLog }: Props) {
  const [committedAction, setCommittedAction] = useState(
    existingLog?.committed_action ?? "",
  );
  // Selected revisit preset index (or null = custom not used yet)
  const [selectedPresetDays, setSelectedPresetDays] = useState<number | null>(
    null,
  );
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [message, setMessage] = useState<string | null>(null);

  // Derive revisitAt from the selected preset.
  const revisitAt = useMemo(
    () =>
      selectedPresetDays !== null ? localDateInDays(selectedPresetDays) : null,
    [selectedPresetDays],
  );

  // If already logged, show the saved state as default copy.
  const alreadyLogged = existingLog !== null && existingLog.outcome === null;
  const outcomeAlreadySubmitted =
    existingLog !== null && existingLog.outcome !== null;

  if (outcomeAlreadySubmitted) {
    // Outcome was submitted — don't show log form again.
    return null;
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (committedAction.trim().length === 0) {
      setStatus("error");
      setMessage("Describe what you're going to do.");
      return;
    }
    if (revisitAt === null) {
      setStatus("error");
      setMessage("Pick a check-back date.");
      return;
    }

    setStatus("saving");
    setMessage(null);

    try {
      const response = await fetch("/api/log-decision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          decisionGuidanceId,
          committedAction: committedAction.trim(),
          revisitAt,
        }),
      });

      const data = (await response.json()) as { error?: string };

      if (!response.ok) {
        setStatus("error");
        setMessage(data.error ?? "Unable to save.");
        return;
      }

      setStatus("saved");
      setMessage(
        revisitAt !== null
          ? `Logged. We'll ask how it went on ${new Date(revisitAt + "T12:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" })}.`
          : "Logged.",
      );
    } catch {
      setStatus("error");
      setMessage("Unable to save.");
    }
  }

  return (
    <div className="card stack" style={{ background: "var(--surface-muted)" }}>
      <div className="stack" style={{ gap: "0.35rem" }}>
        <h2 style={{ margin: 0 }}>Log this decision</h2>
        <p className="muted" style={{ margin: 0 }}>
          {alreadyLogged
            ? "You logged a decision for this question. Update it below."
            : "Optional — write what you decided and pick when to check back."}
        </p>
      </div>

      {status === "saved" ? (
        <p
          style={{
            margin: 0,
            color: "#1f5d43",
            fontWeight: 500,
            fontSize: "0.95rem",
          }}
        >
          {message}
        </p>
      ) : (
        <form className="stack" onSubmit={handleSubmit}>
          <label className="stack" style={{ gap: "0.35rem" }}>
            <span style={{ fontWeight: 500 }}>What are you going to do?</span>
            <textarea
              rows={2}
              value={committedAction}
              onChange={(e) => setCommittedAction(e.target.value)}
              placeholder="e.g. I'm going to send the email this week."
              maxLength={500}
            />
          </label>

          <div className="stack" style={{ gap: "0.4rem" }}>
            <span style={{ fontWeight: 500 }}>Check back in</span>
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "0.4rem",
              }}
            >
              {REVISIT_PRESETS.map((preset) => {
                const selected = selectedPresetDays === preset.days;
                return (
                  <button
                    key={preset.days}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setSelectedPresetDays(preset.days)}
                    style={{
                      padding: "0.35rem 0.85rem",
                      borderRadius: "999px",
                      fontSize: "0.9rem",
                      cursor: "pointer",
                      background: selected
                        ? "var(--accent, #27485e)"
                        : "transparent",
                      color: selected ? "#fff" : "inherit",
                      border: selected
                        ? "1px solid var(--accent, #27485e)"
                        : "1px solid var(--border, #e5e7eb)",
                      transition:
                        "background 120ms ease, color 120ms ease, border-color 120ms ease",
                    }}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="row">
            <button
              className="button"
              type="submit"
              disabled={status === "saving"}
            >
              {status === "saving" ? "Saving…" : alreadyLogged ? "Update log" : "Log decision"}
            </button>
            {status === "error" && message !== null ? (
              <p
                className="muted"
                style={{ margin: 0, color: "#b42318", fontSize: "0.9rem" }}
              >
                {message}
              </p>
            ) : null}
          </div>
        </form>
      )}
    </div>
  );
}
