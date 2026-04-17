export type BlueprintLabelExplanationKey =
  | "life_path"
  | "birthday"
  | "attitude"
  | "name_number"
  | "personal_year"
  | "personal_month"
  | "personal_day"
  | "animal"
  | "element"
  | "polarity"
  | "day_master"
  | "year_pillar"
  | "month_pillar"
  | "day_pillar"
  | "hour_pillar";

// Temporary mobile mirror of the web explanation map. Keep aligned with
// domain/blueprint/blueprint-label-explanations.ts until the projects share
// one import path cleanly.
export const BLUEPRINT_LABEL_EXPLANATIONS: Record<
  BlueprintLabelExplanationKey,
  string
> = {
  life_path:
    "Your main long-range numerology theme, calculated from your birth date. It gives context for the lessons, patterns, and priorities that tend to shape your path over time.",
  birthday:
    "The energy of the day of the month you were born on. It often shows a natural strength or style that comes through more immediately in how you operate.",
  attitude:
    "A shorthand for your default approach to new situations. It often shows the tone of your first instinct before deeper traits come online.",
  name_number:
    "A number derived from your full birth name. It is used to describe talents, outward expression, and the kinds of abilities you are likely to develop and show.",
  personal_year:
    "The larger numerology theme for this year. It is used here as context for what this period tends to emphasize overall.",
  personal_month:
    "The shorter-cycle theme for the current month. It helps explain the tone or pressure of the current stretch inside the bigger yearly pattern.",
  personal_day:
    "The most immediate numerology layer for today. It is used as a small timing signal, not as the whole reading by itself.",
  animal:
    "Your zodiac animal in the Chinese cycle. It acts as a symbolic shorthand for instinctive style, temperament, and the kind of energy you tend to project naturally.",
  element:
    "The five-element quality associated with this signature. It adds the style of force behind the profile, such as drive, adaptability, steadiness, or precision.",
  polarity:
    "Whether the energy is read as more outward/direct or inward/receptive. It helps describe the general direction and expression of your style, not your personality as a whole.",
  day_master:
    "The core self-reference point in BaZi. It is the element used to read your baseline operating nature and how the rest of the chart relates back to you.",
  year_pillar:
    "The outer-context layer in the chart. It is commonly used for background influences, early environment, and the wider social frame around you.",
  month_pillar:
    "The structure-and-role layer in the chart. It is often read for work patterns, responsibilities, and the environment that shapes your active adult life.",
  day_pillar:
    "The close-to-self layer in the chart. It is often used for core identity and close one-to-one dynamics.",
  hour_pillar:
    "The inner-drive and later-development layer in the chart. It is often used for long-range growth, inner motivations, and what matures over time.",
};

export function getBlueprintLabelExplanation(
  key: BlueprintLabelExplanationKey,
) {
  return BLUEPRINT_LABEL_EXPLANATIONS[key];
}
