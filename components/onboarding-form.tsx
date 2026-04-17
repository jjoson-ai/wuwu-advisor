"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import {
  saveOnboardingAction,
  type OnboardingActionState,
} from "@/app/onboarding/actions";
import {
  BAZI_CALCULATION_MARKER_OPTIONS,
  BIRTH_TIME_CONFIDENCE_OPTIONS,
  TONE_PREFERENCE_OPTIONS,
} from "@/lib/config";
import {
  getSafeTimeZone,
  getSupportedTimeZones,
  isSupportedTimeZone,
} from "@/lib/timezones";
import { OnboardingInput } from "@/lib/validations";

const initialState: OnboardingActionState = {
  error: null,
};
const TIME_ZONE_OPTIONS = getSupportedTimeZones();

function formatOptionLabel(value: string) {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <button className="button" disabled={pending} type="submit">
      {pending ? "Saving..." : "Save and continue"}
    </button>
  );
}

export function OnboardingForm({
  initialValues,
}: {
  initialValues: OnboardingInput;
}) {
  const [state, formAction] = useActionState(saveOnboardingAction, initialState);
  const hasInvalidSavedTimezone =
    initialValues.timezone !== "" && isSupportedTimeZone(initialValues.timezone) === false;
  const selectedTimezone = getSafeTimeZone(initialValues.timezone);

  return (
    <form action={formAction} className="stack">
      <section className="card card-featured stack">
        <div className="form-section-header">
          <p className="card-eyebrow">Account basics</p>
          <h2 className="section-heading-serif">Profile and preferences</h2>
          <p className="card-subtitle">
            These details shape how the app addresses you and how it frames your guidance.
          </p>
        </div>

        <div className="grid two">
          <label className="field">
            <span>Display name</span>
            <input
              defaultValue={initialValues.displayName}
              name="displayName"
              placeholder="Your preferred name"
            />
          </label>

          <label className="field">
            <span>Current timezone</span>
            <select defaultValue={selectedTimezone} name="timezone" required>
              {TIME_ZONE_OPTIONS.map((timeZone) => (
                <option key={timeZone} value={timeZone}>
                  {timeZone}
                </option>
              ))}
            </select>
            <small className="muted">Use the timezone where you currently live.</small>
            {hasInvalidSavedTimezone ? (
              <small className="muted">
                Your saved timezone was not recognized. Pick a valid timezone such as
                Europe/Madrid.
              </small>
            ) : null}
          </label>

          <label className="field" style={{ gridColumn: "1 / -1" }}>
            <span>Full birth name (for numerology)</span>
            <input
              defaultValue={initialValues.fullBirthNameForNumerology}
              name="fullBirthNameForNumerology"
              placeholder="Enter your full birth name"
              required
            />
            <small className="muted">
              Enter your full name at birth as completely as possible. One name is
              fine. Multiple given or family names are fine too.
            </small>
          </label>

          <label className="field">
            <span>How should the app sound?</span>
            <select defaultValue={initialValues.tonePreference} name="tonePreference">
              {TONE_PREFERENCE_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {formatOptionLabel(option)}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <section className="card card-feature stack">
        <div className="form-section-header">
          <p className="card-eyebrow">Birth data</p>
          <h2 className="section-heading-serif">Birth profile</h2>
          <p className="card-subtitle">
            This is the reference data used for Blueprint, Forecast, Today, and Ask.
          </p>
        </div>

        <div className="grid two">
          <label className="field" style={{ gridColumn: "1 / -1" }}>
            <span>BaZi calculation marker (optional)</span>
            <select
              defaultValue={initialValues.baziCalculationMarker}
              name="baziCalculationMarker"
            >
              <option value="">Leave blank</option>
              {BAZI_CALCULATION_MARKER_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
            <small className="muted">
              This external Four Pillars engine currently requires M or F for
              luck-cycle direction. This field is only used for BaZi calculation and
              does not define your general gender identity in the app.
            </small>
          </label>

          <label className="field">
            <span>Birth date</span>
            <input
              defaultValue={initialValues.birthDate}
              name="birthDate"
              required
              type="date"
            />
          </label>

          <label className="field">
            <span>Birth time</span>
            <input
              defaultValue={initialValues.birthTime}
              name="birthTime"
              placeholder="14:30"
              type="time"
            />
          </label>

          <label className="field">
            <span>How sure are you about your birth time?</span>
            <select
              defaultValue={initialValues.birthTimeConfidence}
              name="birthTimeConfidence"
              required
            >
              {BIRTH_TIME_CONFIDENCE_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {formatOptionLabel(option)}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>Birth city</span>
            <input
              defaultValue={initialValues.birthCity}
              name="birthCity"
              placeholder="Madrid"
              required
            />
          </label>

          <label className="field">
            <span>Birth country</span>
            <input
              defaultValue={initialValues.birthCountry}
              name="birthCountry"
              placeholder="Spain"
              required
            />
          </label>
        </div>
      </section>

      <div className="form-actions">
        <SubmitButton />
        <p className="muted" style={{ margin: 0, minHeight: "1.5rem" }}>
          {state.error}
        </p>
      </div>
    </form>
  );
}
