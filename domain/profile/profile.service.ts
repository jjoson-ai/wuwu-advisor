import "server-only";

import { PostgrestError } from "@supabase/supabase-js";

import {
  BirthDataRow,
  OnboardingProfilePayload,
  OnboardingRecord,
  ProfileRow,
} from "@/domain/profile/profile.types";
import { getSupabaseServerClient } from "@/lib/supabase/server";
import { getDefaultOnboardingInput, OnboardingInput } from "@/lib/validations";

function formatDbError(error: PostgrestError | null, fallback: string) {
  if (error === null) {
    return fallback;
  }

  const relationName =
    error.message.match(/'public\.([^']+)'/)?.[1] ??
    error.message.match(/relation "public\.([^"]+)"/)?.[1] ??
    null;

  if (error.code === "PGRST205" || error.message.includes("schema cache")) {
    const relationLabel = relationName ?? "the required tables";

    return `Supabase setup error: could not find public.${relationLabel} in the connected project. Run sql/001_init.sql in Supabase, verify public.profiles and public.birth_data exist, and confirm NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY point to that same project.`;
  }

  return error.message || fallback;
}

export async function getOnboardingRecord(
  userId: string,
  accessToken?: string | null,
): Promise<OnboardingRecord> {
  const supabase = await getSupabaseServerClient(accessToken ?? undefined);

  const [profileResult, birthDataResult] = await Promise.all([
    supabase
      .from("profiles")
      .select(
        "user_id, display_name, timezone, tone_preference, created_at, updated_at",
      )
      .eq("user_id", userId)
      .maybeSingle(),
    supabase
      .from("birth_data")
      .select(
        "user_id, birth_date, birth_time, birth_time_confidence, birth_city, birth_country, full_birth_name_for_numerology, bazi_calculation_marker, birth_latitude, birth_longitude, birth_timezone, created_at, updated_at",
      )
      .eq("user_id", userId)
      .maybeSingle(),
  ]);

  if (profileResult.error !== null) {
    throw new Error(formatDbError(profileResult.error, "Unable to load profile."));
  }

  if (birthDataResult.error !== null) {
    throw new Error(formatDbError(birthDataResult.error, "Unable to load birth data."));
  }

  return {
    profile: (profileResult.data as ProfileRow | null) ?? null,
    birthData: (birthDataResult.data as BirthDataRow | null) ?? null,
  };
}

export function isOnboardingComplete(record: OnboardingRecord) {
  return Boolean(
    record.profile?.timezone &&
      record.birthData?.birth_date &&
      record.birthData?.birth_time_confidence &&
      record.birthData?.birth_city &&
      record.birthData?.birth_country &&
      record.birthData?.full_birth_name_for_numerology,
  );
}

export function getOnboardingInputFromRecord(
  record: OnboardingRecord,
): OnboardingInput {
  const defaults = getDefaultOnboardingInput();

  return {
    displayName: record.profile?.display_name ?? defaults.displayName,
    fullBirthNameForNumerology:
      record.birthData?.full_birth_name_for_numerology ??
      defaults.fullBirthNameForNumerology,
    baziCalculationMarker:
      record.birthData?.bazi_calculation_marker ?? defaults.baziCalculationMarker,
    birthDate: record.birthData?.birth_date ?? defaults.birthDate,
    birthTime: record.birthData?.birth_time ?? defaults.birthTime,
    birthTimeConfidence:
      record.birthData?.birth_time_confidence ?? defaults.birthTimeConfidence,
    birthCity: record.birthData?.birth_city ?? defaults.birthCity,
    birthCountry: record.birthData?.birth_country ?? defaults.birthCountry,
    timezone: record.profile?.timezone ?? defaults.timezone,
    tonePreference: record.profile?.tone_preference ?? defaults.tonePreference,
  };
}

export async function upsertOnboardingRecord(
  userId: string,
  payload: OnboardingProfilePayload,
  accessToken?: string | null,
) {
  const supabase = await getSupabaseServerClient(accessToken ?? undefined);

  const [profileResult, birthDataResult] = await Promise.all([
    supabase.from("profiles").upsert(
      {
        user_id: userId,
        display_name: payload.profile.display_name,
        timezone: payload.profile.timezone,
        tone_preference: payload.profile.tone_preference,
      },
      { onConflict: "user_id" },
    ),
    supabase.from("birth_data").upsert(
      {
        user_id: userId,
        birth_date: payload.birthData.birth_date,
        birth_time: payload.birthData.birth_time,
        birth_time_confidence: payload.birthData.birth_time_confidence,
        birth_city: payload.birthData.birth_city,
        birth_country: payload.birthData.birth_country,
        full_birth_name_for_numerology:
          payload.birthData.full_birth_name_for_numerology,
        bazi_calculation_marker: payload.birthData.bazi_calculation_marker,
        birth_latitude: payload.birthData.birth_latitude,
        birth_longitude: payload.birthData.birth_longitude,
        birth_timezone: payload.birthData.birth_timezone,
      },
      { onConflict: "user_id" },
    ),
  ]);

  if (profileResult.error !== null) {
    return {
      success: false as const,
      message: formatDbError(profileResult.error, "Unable to save profile."),
    };
  }

  if (birthDataResult.error !== null) {
    return {
      success: false as const,
      message: formatDbError(birthDataResult.error, "Unable to save birth data."),
    };
  }

  return { success: true as const };
}
