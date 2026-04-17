export type ProfileRow = {
  user_id: string;
  display_name: string | null;
  timezone: string;
  tone_preference: string | null;
  created_at: string;
  updated_at: string;
};

export type BirthDataRow = {
  user_id: string;
  birth_date: string;
  birth_time: string | null;
  birth_time_confidence: string;
  birth_city: string;
  birth_country: string;
  full_birth_name_for_numerology: string | null;
  bazi_calculation_marker: "M" | "F" | null;
  birth_latitude: number | null;
  birth_longitude: number | null;
  birth_timezone: string | null;
  created_at: string;
  updated_at: string;
};

export type OnboardingRecord = {
  profile: ProfileRow | null;
  birthData: BirthDataRow | null;
};

export type OnboardingProfilePayload = {
  profile: Pick<ProfileRow, "display_name" | "timezone" | "tone_preference">;
  birthData: Pick<
    BirthDataRow,
    | "birth_date"
    | "birth_time"
    | "birth_time_confidence"
    | "birth_city"
    | "birth_country"
    | "full_birth_name_for_numerology"
    | "bazi_calculation_marker"
    | "birth_latitude"
    | "birth_longitude"
    | "birth_timezone"
  >;
};
