import {
  BAZI_CALCULATION_MARKER_OPTIONS,
  BIRTH_TIME_CONFIDENCE_OPTIONS,
  TONE_PREFERENCE_OPTIONS,
} from "@/lib/config";
import { DEFAULT_TIME_ZONE, isSupportedTimeZone } from "@/lib/timezones";

export type OnboardingInput = {
  displayName: string;
  fullBirthNameForNumerology: string;
  baziCalculationMarker: string;
  birthDate: string;
  birthTime: string;
  birthTimeConfidence: string;
  birthCity: string;
  birthCountry: string;
  timezone: string;
  tonePreference: string;
};

type ValidationResult =
  | { success: true }
  | { success: false; message: string };

export function getDefaultOnboardingInput(): OnboardingInput {
  return {
    displayName: "",
    fullBirthNameForNumerology: "",
    baziCalculationMarker: "",
    birthDate: "",
    birthTime: "",
    birthTimeConfidence: BIRTH_TIME_CONFIDENCE_OPTIONS[0],
    birthCity: "",
    birthCountry: "",
    timezone: DEFAULT_TIME_ZONE,
    tonePreference: TONE_PREFERENCE_OPTIONS[0],
  };
}

export function getOnboardingInputFromFormData(
  formData: FormData,
): OnboardingInput {
  return {
    displayName: String(formData.get("displayName") ?? "").trim(),
    fullBirthNameForNumerology: String(
      formData.get("fullBirthNameForNumerology") ?? "",
    ).trim(),
    baziCalculationMarker: String(formData.get("baziCalculationMarker") ?? "").trim(),
    birthDate: String(formData.get("birthDate") ?? "").trim(),
    birthTime: String(formData.get("birthTime") ?? "").trim(),
    birthTimeConfidence: String(
      formData.get("birthTimeConfidence") ?? "",
    ).trim(),
    birthCity: String(formData.get("birthCity") ?? "").trim(),
    birthCountry: String(formData.get("birthCountry") ?? "").trim(),
    timezone: String(formData.get("timezone") ?? "").trim(),
    tonePreference: String(formData.get("tonePreference") ?? "").trim(),
  };
}

export function getOnboardingInputFromObject(
  value: Record<string, unknown> | null | undefined,
): OnboardingInput {
  return {
    displayName: String(value?.displayName ?? "").trim(),
    fullBirthNameForNumerology: String(
      value?.fullBirthNameForNumerology ?? "",
    ).trim(),
    baziCalculationMarker: String(value?.baziCalculationMarker ?? "").trim(),
    birthDate: String(value?.birthDate ?? "").trim(),
    birthTime: String(value?.birthTime ?? "").trim(),
    birthTimeConfidence: String(value?.birthTimeConfidence ?? "").trim(),
    birthCity: String(value?.birthCity ?? "").trim(),
    birthCountry: String(value?.birthCountry ?? "").trim(),
    timezone: String(value?.timezone ?? "").trim(),
    tonePreference: String(value?.tonePreference ?? "").trim(),
  };
}

export function validateOnboardingInput(
  input: OnboardingInput,
): ValidationResult {
  if (input.birthDate === "") {
    return { success: false, message: "Birth date is required." };
  }

  if (input.fullBirthNameForNumerology === "") {
    return {
      success: false,
      message: "Full birth name for numerology is required.",
    };
  }

  if (
    input.baziCalculationMarker !== "" &&
    BAZI_CALCULATION_MARKER_OPTIONS.includes(
      input.baziCalculationMarker as (typeof BAZI_CALCULATION_MARKER_OPTIONS)[number],
    ) === false
  ) {
    return {
      success: false,
      message: "BaZi calculation marker must be M, F, or left blank.",
    };
  }

  if (input.birthCity === "" || input.birthCountry === "") {
    return {
      success: false,
      message: "Birth city and birth country are required.",
    };
  }

  if (input.timezone === "") {
    return { success: false, message: "Current timezone is required." };
  }

  if (isSupportedTimeZone(input.timezone) === false) {
    return {
      success: false,
      message:
        "Current timezone must be a supported timezone like Europe/Madrid.",
    };
  }

  if (
    BIRTH_TIME_CONFIDENCE_OPTIONS.includes(
      input.birthTimeConfidence as (typeof BIRTH_TIME_CONFIDENCE_OPTIONS)[number],
    ) === false
  ) {
    return {
      success: false,
      message: "Birth time confidence must be a supported option.",
    };
  }

  if (
    TONE_PREFERENCE_OPTIONS.includes(
      input.tonePreference as (typeof TONE_PREFERENCE_OPTIONS)[number],
    ) === false
  ) {
    return {
      success: false,
      message: "Tone preference must be a supported option.",
    };
  }

  return { success: true };
}
