"use client";

import { useState } from "react";

import {
  ACTED_ON_OPTIONS,
  type ActedOnValue,
  type BriefingFeedbackRow,
} from "@/domain/feedback/feedback.types";

type BriefingFeedbackFormProps = {
  briefingId: string;
  existingFeedback: BriefingFeedbackRow | null;
};

function formatOptionLabel(value: string) {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function BriefingFeedbackForm({
  briefingId,
  existingFeedback,
}: BriefingFeedbackFormProps) {
  const [usefulnessScore, setUsefulnessScore] = useState(
    String(existingFeedback?.usefulness_score ?? 3),
  );
  const [actedOn, setActedOn] = useState<ActedOnValue>(
    existingFeedback?.acted_on ?? "partial",
  );
  const [note, setNote] = useState(existingFeedback?.note ?? "");
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">(
    "idle",
  );
  const [message, setMessage] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("saving");
    setMessage(null);

    try {
      const response = await fetch("/api/submit-feedback", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          briefingId,
          usefulnessScore,
          actedOn,
          note,
        }),
      });

      const data = (await response.json()) as { error?: string; message?: string };

      if (response.ok === false) {
        setStatus("error");
        setMessage(data.error ?? "Unable to save feedback.");
        return;
      }

      setStatus("saved");
      setMessage(data.message ?? "Feedback saved.");
    } catch {
      setStatus("error");
      setMessage("Unable to save feedback.");
    }
  }

  return (
    <div className="card stack" style={{ background: "var(--surface-muted)" }}>
      <div className="stack" style={{ gap: "0.35rem" }}>
        <h2 style={{ margin: 0 }}>Feedback</h2>
        <p className="muted" style={{ margin: 0 }}>
          Rate how useful this briefing felt and whether you acted on it.
        </p>
        {existingFeedback !== null ? (
          <p className="muted" style={{ margin: 0 }}>
            Existing feedback loaded from your latest saved response.
          </p>
        ) : null}
      </div>

      <form className="stack" onSubmit={handleSubmit}>
        <label className="stack" style={{ gap: "0.35rem" }}>
          <span>Usefulness score</span>
          <select
            value={usefulnessScore}
            onChange={(event) => setUsefulnessScore(event.target.value)}
          >
            {[1, 2, 3, 4, 5].map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>

        <label className="stack" style={{ gap: "0.35rem" }}>
          <span>Acted on it</span>
          <select
            value={actedOn}
            onChange={(event) => setActedOn(event.target.value as ActedOnValue)}
          >
            {ACTED_ON_OPTIONS.map((value) => (
              <option key={value} value={value}>
                {formatOptionLabel(value)}
              </option>
            ))}
          </select>
        </label>

        <label className="stack" style={{ gap: "0.35rem" }}>
          <span>Optional note</span>
          <textarea
            rows={4}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="What felt accurate, useful, or off?"
          />
        </label>

        <div className="row">
          <button className="button" disabled={status === "saving"} type="submit">
            {status === "saving" ? "Saving..." : "Submit feedback"}
          </button>
          {message !== null ? (
            <p
              className="muted"
              style={{ margin: 0, color: status === "error" ? "#b42318" : undefined }}
            >
              {message}
            </p>
          ) : null}
        </div>
      </form>
    </div>
  );
}
