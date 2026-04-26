"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import {
  RATING_EMOJI_OPTIONS,
  RATING_THEME_OPTIONS,
  type BriefingFeedbackRow,
  type RatingEmojiValue,
  type RatingThemeValue,
} from "@/domain/feedback/feedback.types";

type BriefingFeedbackFormProps = {
  briefingId: string;
  existingFeedback: BriefingFeedbackRow | null;
};

const EMOJI_LABELS: Record<
  RatingEmojiValue,
  { icon: string; headline: string; blurb: string }
> = {
  nailed_it: {
    icon: "🎯",
    headline: "Nailed it",
    blurb: "The briefing matched today.",
  },
  vague: {
    icon: "🌫️",
    headline: "Vague",
    blurb: "Could apply to anyone.",
  },
  off: {
    icon: "🙃",
    headline: "Off",
    blurb: "Read my day wrong.",
  },
};

const THEME_LABELS: Record<RatingThemeValue, string> = {
  career: "Career",
  money: "Money",
  relationships: "Relationships",
  health: "Health",
  personal_growth: "Personal growth",
  timing: "Timing window",
};

type SubmitStatus = "idle" | "saving" | "saved" | "error";

function toggleIn<T>(list: readonly T[], value: T): T[] {
  return list.includes(value)
    ? list.filter((item) => item !== value)
    : [...list, value];
}

export function BriefingFeedbackForm({
  briefingId,
  existingFeedback,
}: BriefingFeedbackFormProps) {
  const [ratingEmoji, setRatingEmoji] = useState<RatingEmojiValue | null>(
    existingFeedback?.rating_emoji ?? null,
  );
  const [themeHit, setThemeHit] = useState<RatingThemeValue[]>(
    existingFeedback?.rating_theme_hit ?? [],
  );
  const [themeMiss, setThemeMiss] = useState<RatingThemeValue[]>(
    existingFeedback?.rating_theme_miss ?? [],
  );
  const [note, setNote] = useState(existingFeedback?.note ?? "");
  const [status, setStatus] = useState<SubmitStatus>("idle");
  const [message, setMessage] = useState<string | null>(null);

  // Once the user picks an emoji, reveal the "what hit / what missed" chips.
  // A single tap is the happy path — chips are optional detail.
  const hasRating = ratingEmoji !== null;

  // A miss can't also be a hit. Toggling one clears the other for that theme.
  const handleToggleHit = (theme: RatingThemeValue) => {
    setThemeHit((prev) => toggleIn(prev, theme));
    setThemeMiss((prev) => prev.filter((item) => item !== theme));
  };

  const handleToggleMiss = (theme: RatingThemeValue) => {
    setThemeMiss((prev) => toggleIn(prev, theme));
    setThemeHit((prev) => prev.filter((item) => item !== theme));
  };

  const submitLabel = useMemo(() => {
    if (status === "saving") return "Saving…";
    if (existingFeedback === null) return "Submit rating";
    return "Update rating";
  }, [status, existingFeedback]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (ratingEmoji === null) {
      setStatus("error");
      setMessage("Pick a rating first.");
      return;
    }

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
          ratingEmoji,
          ratingThemeHit: themeHit,
          ratingThemeMiss: themeMiss,
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
      setMessage(data.message ?? "Thanks — this tunes future briefings.");
    } catch {
      setStatus("error");
      setMessage("Unable to save feedback.");
    }
  }

  return (
    <div className="card stack" style={{ background: "var(--surface-muted)" }}>
      <div className="stack" style={{ gap: "0.35rem" }}>
        <h2 style={{ margin: 0 }}>Rate this briefing</h2>
        <p className="muted" style={{ margin: 0 }}>
          One tap helps us calibrate your chart. Details optional.
        </p>
      </div>

      <form className="stack" onSubmit={handleSubmit}>
        {/* Emoji row — the entire rating in one tap */}
        <div
          role="radiogroup"
          aria-label="Briefing accuracy rating"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
            gap: "0.5rem",
          }}
        >
          {RATING_EMOJI_OPTIONS.map((value) => {
            const label = EMOJI_LABELS[value];
            const selected = ratingEmoji === value;
            return (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => setRatingEmoji(value)}
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
                    ? "2px solid var(--accent, #4f46e5)"
                    : "1px solid var(--border, #e5e7eb)",
                  transition: "border-color 120ms ease, background 120ms ease",
                }}
              >
                <div style={{ fontSize: "1.5rem", lineHeight: 1 }}>
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

        {hasRating ? (
          <>
            <ThemeChipRow
              heading="What hit?"
              helper="Optional — tap the cards that matched today."
              selected={themeHit}
              disabled={themeMiss}
              onToggle={handleToggleHit}
              tone="hit"
            />

            <ThemeChipRow
              heading="What missed?"
              helper="Tap anything the briefing got wrong."
              selected={themeMiss}
              disabled={themeHit}
              onToggle={handleToggleMiss}
              tone="miss"
            />

            <label className="stack" style={{ gap: "0.35rem" }}>
              <span>Optional note</span>
              <textarea
                rows={3}
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="What was the actual day about?"
              />
            </label>
          </>
        ) : null}

        <div className="row">
          <button
            className="button"
            disabled={status === "saving" || ratingEmoji === null}
            type="submit"
          >
            {submitLabel}
          </button>
          {message !== null ? (
            <p
              className="muted"
              style={{
                margin: 0,
                color: status === "error" ? "#b42318" : undefined,
              }}
            >
              {message}
            </p>
          ) : null}
        </div>
      </form>

      <p className="muted" style={{ margin: 0, fontSize: "0.85rem" }}>
        <Link href="/accuracy">See your accuracy read →</Link>
      </p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ThemeChipRow — row of 6 toggleable chips for the "what hit / what missed"
// sections. Chips disabled when the opposite row already owns that theme.
// ─────────────────────────────────────────────────────────────────────────────

type ThemeChipRowProps = {
  heading: string;
  helper: string;
  selected: RatingThemeValue[];
  disabled: RatingThemeValue[];
  onToggle: (theme: RatingThemeValue) => void;
  tone: "hit" | "miss";
};

function ThemeChipRow({
  heading,
  helper,
  selected,
  disabled,
  onToggle,
  tone,
}: ThemeChipRowProps) {
  const selectedSet = new Set(selected);
  const disabledSet = new Set(disabled);
  const accent = tone === "hit" ? "#15803d" : "#b42318";

  return (
    <fieldset
      className="stack"
      style={{ border: 0, padding: 0, margin: 0, gap: "0.4rem" }}
    >
      <legend style={{ padding: 0, fontWeight: 600, fontSize: "0.95rem" }}>
        {heading}
      </legend>
      <p className="muted" style={{ margin: 0, fontSize: "0.85rem" }}>
        {helper}
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
        {RATING_THEME_OPTIONS.map((value) => {
          const isSelected = selectedSet.has(value);
          const isDisabled = disabledSet.has(value);
          return (
            <button
              key={value}
              type="button"
              aria-pressed={isSelected}
              disabled={isDisabled}
              onClick={() => onToggle(value)}
              style={{
                padding: "0.35rem 0.7rem",
                borderRadius: "999px",
                fontSize: "0.85rem",
                cursor: isDisabled ? "not-allowed" : "pointer",
                opacity: isDisabled ? 0.4 : 1,
                background: isSelected ? accent : "transparent",
                color: isSelected ? "#fff" : "inherit",
                border: isSelected
                  ? `1px solid ${accent}`
                  : "1px solid var(--border, #e5e7eb)",
                transition:
                  "background 120ms ease, color 120ms ease, border-color 120ms ease",
              }}
            >
              {THEME_LABELS[value]}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
