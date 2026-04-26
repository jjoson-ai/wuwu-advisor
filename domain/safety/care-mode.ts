/**
 * Care Mode — the hardcoded, non-LLM response that is served when a crisis
 * signal is detected (either on input or on output).
 *
 * Rules:
 * - NEVER call an LLM to generate this response. Deterministic only. The
 *   whole point of Care Mode is that the crisis path cannot hallucinate.
 * - NEVER include the user's original question text. No paraphrase, no
 *   reflection of their situation. We do not want the model validating
 *   or echoing crisis language.
 * - Resources cover the major anglophone + EU regions we serve. We end
 *   with findahelpline.com for global coverage. If/when we localize per
 *   user country, branch on profile.birth_country or geoIP.
 * - Language is reflective and warm, not clinical. But it is direct about
 *   one thing: please contact a human now.
 *
 * Roadmap reference: 1.7.
 */

import type { CrisisSeverity } from "@/domain/safety/crisis-detection";

export type CareModeResource = {
  label: string;
  region: string;
  contact: string;
  contact_href: string | null;
};

export type CareModePayload = {
  mode: "care_mode";
  severity: CrisisSeverity;
  headline: string;
  message: string;
  prompt_action: string;
  resources: CareModeResource[];
  disclaimer: string;
};

const CARE_MODE_RESOURCES: ReadonlyArray<CareModeResource> = [
  {
    label: "988 Suicide & Crisis Lifeline",
    region: "US & Canada",
    contact: "Call or text 988",
    contact_href: "tel:988",
  },
  {
    label: "Samaritans",
    region: "UK & Ireland",
    contact: "Call 116 123 (free, 24/7)",
    contact_href: "tel:116123",
  },
  {
    label: "Crisis Text Line",
    region: "US, UK, Canada, Ireland",
    contact: "Text HOME to 741741 (US), 85258 (UK), 686868 (CA), 50808 (IE)",
    contact_href: null,
  },
  {
    label: "Find a Helpline",
    region: "Global — 130+ countries",
    contact: "findahelpline.com",
    contact_href: "https://findahelpline.com",
  },
] as const;

/**
 * Build the Care Mode payload. Severity is passed through for telemetry,
 * but does NOT change the copy — we show the same calm, direct response
 * in both cases. Treating "elevated" with a softer copy would create a
 * path where we downgrade the warmth of response exactly when someone
 * is already minimizing their own distress.
 */
export function buildCareModePayload(
  severity: CrisisSeverity,
): CareModePayload {
  return {
    mode: "care_mode",
    severity,
    headline: "I'm not the right support for this",
    message:
      "What you're carrying sounds heavier than a reading can hold. I want to step back and point you to someone who can actually be with you through this — a trained person, on a line that's answered by humans 24/7.",
    prompt_action:
      "If you might act on this soon, please contact emergency services or one of the lines below now. If you can, stay with a person you trust until the wave passes.",
    resources: [...CARE_MODE_RESOURCES],
    disclaimer:
      "Wuwu Advisor is for reflection and entertainment. It is not a crisis service, therapist, or emergency line. In an emergency, call your local emergency number.",
  };
}

export const CARE_MODE_VERSION = "1.0.0";
