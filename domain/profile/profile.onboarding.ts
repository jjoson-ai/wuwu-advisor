import "server-only";

import type { BaziCalculationMarker } from "@/lib/freeastroapi";
import { geocodeBirthplace } from "@/lib/geocode";
import type { OnboardingInput } from "@/lib/validations";

import { upsertOnboardingRecord } from "@/domain/profile/profile.service";

export async function saveOnboardingInputForUser(
  userId: string,
  input: OnboardingInput,
  accessToken?: string | null,
) {
  const geocodeResult = await geocodeBirthplace({
    birthCity: input.birthCity,
    birthCountry: input.birthCountry,
  });
  const baziCalculationMarker =
    input.baziCalculationMarker === ""
      ? null
      : (input.baziCalculationMarker as BaziCalculationMarker);

  return upsertOnboardingRecord(userId, {
    profile: {
      display_name: input.displayName || null,
      timezone: input.timezone,
      tone_preference: input.tonePreference || null,
    },
    birthData: {
      birth_date: input.birthDate,
      birth_time: input.birthTime || null,
      birth_time_confidence: input.birthTimeConfidence,
      birth_city: input.birthCity,
      birth_country: input.birthCountry,
      full_birth_name_for_numerology: input.fullBirthNameForNumerology,
      bazi_calculation_marker: baziCalculationMarker,
      birth_latitude: geocodeResult.latitude,
      birth_longitude: geocodeResult.longitude,
      birth_timezone: geocodeResult.birthTimezone,
    },
  }, accessToken ?? undefined);
}
