"use client";

import Link from "next/link";
import { useState } from "react";

import {
  DECISION_OUTCOME_OPTIONS,
  type DecisionLogRow,
  type DecisionOutcomeValue,
} from "@/domain/decision/decision-log.types";

type Props = {
  log: DecisionLogRow;
  /** Display label for the original question, shown as context. */
  questionText: string;
};

type SaveStatus = "idle" | "saving" | "saved" | "error";

const OUTCOME_LABELS: Record<
  DecisionOutcomeValue,
  { icon: string; headline: string; blurb: string }
> = {
  went_well: {
    icon: "✅",
    headline: "Went well",
    blurb: "It played out as hoped.",
  },
  mixed: {
    icon: "⚖️",
    headline: "Mixed",
    blurb: "Some things worked, some didn't.",
  },
  went_poorly: {
    icon: "❌",
    headline: "Went poorly",
    blurb: "Didn't land the way I hoped.",
  },
};

export function DecisionOutcomeForm({ log, questionText }: Props) {
  const [outcome, setOutcome] = useState<DecisionOutcomeValue | null>(null);
  const [note, setNote] = useState("");
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (outcome === null) {
      setStatus("error");
      setMessage("Pick an outcome first.");
      return;
    }

    setStatus("saving");
    setMessage(null);

    try {
      const response = await fetch("/api/submit-decision-outcome", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          logId: log.id,
          outcome,
          outcomeNote: note.trim() || null,
        }),
      });

      const data = (await response.json()) as { error?: string };

      if (!response.ok) {
        setStatus("error");
        setMessage(data.error ?? "Unable to save outcome.");
        return;
      }

      setStatus("saved");
      setMessage("Thanks — this helps calibrate future guidance.");
    } catch {
      setStatus("error");
      setMessage("Unable to save outcome.");
    }
  }

  if (status === "saved") {
    return (
      <div className="card stack" style={{ background: "var(--surface-muted)" }}>
        <div className="stack" style={{ gap: "0.3rem" }}>
          <h2 style={{ margin: 0 }}>Outcome recorded ✓</h2>
          <p className="muted" style={{ margin: 0 }}>
            {message}
          </p>
          <p className="muted" style={{ margin: 0, fontSize: "0.85rem" }}>
            <Link href="/decision">← Back to Ask</Link>
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="card stack" style={{ background: "var(--surface-muted)" }}>
      <div className="stack" style={{ gap: "0.35rem" }}>
        <p className="card-eyebrow" style={{ margin: 0 }}>
          Check-back
        </p>
        <h2 style={{ margin: 0 }}>How did it go?</h2>
        <p className="muted" style={{ margin: 0, fontSize: "0.9rem" }}>
          You logged: <em>"{log.committed_action}"</em>
        </p>
        <p className="muted" style={{ margin: 0, fontSize: "0.85rem" }}>
          Question: {questionText}
        </p>
      </div>

      <form className="stack" onSubmit={handleSubmit}>
        {/* 3-card outcome row */}
        <div
          role="radiogroup"
          aria-label="Decision outcome"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
            gap: "0.5rem",
          }}
        >
          {DECISION_OUTCOME_OPTIONS.map((value) => {
            const label = OUTCOME_LABELS[value];
            const selected = outcome === value;
            return (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setOutcome(value)}
                className="card"
                style={{
                  borderRadius: "0.75rem",
                  padding: "0.75rem 0.5rem",
                  textAlign: "center",
                  cursor: "pointer",
                  background: selected
                    ? "var(--surface-raised, #fff)"
                    : "transparent",
                  border: selected
                    ? "2px solid var(--accent, #27485e)"
                    : "1px solid var(--border, #e5e7eb)",
                  transition:
                    "border-color 120ms ease, background 120ms ease",
                }}
              >
                <div style={{ fontSize: "1.4rem", lineHeight: 1 }}>
                  {label.icon}
                </div>
                <div
                  style={{
                    marginTop: "0.35rem",
                    fontWeight: 600,
                    fontSize: "0.95rem",
                  }}
                >
                  {label.headline}
                </div>
                <div
                  className="muted"
                  style={{ marginTop: "0.15rem", fontSize: "0.8rem" }}
                >
                  {label.blurb}
                </div>
              </button>
            );
          })}
        </div>

        {outcome !== null ? (
          <label className="stack" style={{ gap: "0.35rem" }}>
            <span>Optional note</span>
            <textarea
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="What actually happened?"
              maxLength={500}
            />
          </label>
        ) : null}

        <div className="row">
          <button
            className="button"
            type="submit"
            disabled={status === "saving" || outcome === null}
          >
            {status === "saving" ? "Saving…" : "Submit outcome"}
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
    </div>
  );
}
