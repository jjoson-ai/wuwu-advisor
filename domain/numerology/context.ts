import type { DailyBriefingInput } from "@/domain/astrology/schemas";

export type NumerologyContext = {
  life_path_number: number;
  birthday_number: number;
  attitude_number: number;
  name_number: number | null;
  personal_year: number;
  personal_month: number;
  personal_day: number;
  limitations: string[];
};

type NumerologyContextInput = Pick<DailyBriefingInput, "birth_date" | "date"> & {
  full_birth_name_for_numerology?: string | null;
};

const MASTER_NUMBERS = new Set([11, 22, 33]);
const LETTER_VALUES = {
  A: 1,
  B: 2,
  C: 3,
  D: 4,
  E: 5,
  F: 6,
  G: 7,
  H: 8,
  I: 9,
  J: 1,
  K: 2,
  L: 3,
  M: 4,
  N: 5,
  O: 6,
  P: 7,
  Q: 8,
  R: 9,
  S: 1,
  T: 2,
  U: 3,
  V: 4,
  W: 5,
  X: 6,
  Y: 7,
  Z: 8,
} as const;

function sumDigits(value: string) {
  return value
    .replace(/\D/g, "")
    .split("")
    .reduce((total, digit) => total + Number(digit), 0);
}

function reduceNumber(value: number) {
  let current = value;

  while (current > 9 && MASTER_NUMBERS.has(current) === false) {
    current = String(current)
      .split("")
      .reduce((total, digit) => total + Number(digit), 0);
  }

  return current;
}

function parseDateParts(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return { year, month, day };
}

function normalizeNameForNumerology(name: string) {
  // Deterministic normalization:
  // - trim surrounding whitespace
  // - convert to uppercase
  // - remove accents via Unicode NFD decomposition
  // - keep letters from any script only if they resolve to A-Z after decomposition
  // - ignore spaces, punctuation, symbols, and casing differences
  return name
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z]/g, "");
}

function getNameNumber(fullBirthNameForNumerology: string | null | undefined) {
  if (fullBirthNameForNumerology == null || fullBirthNameForNumerology.trim() === "") {
    return null;
  }

  const normalized = normalizeNameForNumerology(fullBirthNameForNumerology);

  if (normalized === "") {
    return null;
  }

  const total = normalized
    .split("")
    .reduce((sum, letter) => sum + LETTER_VALUES[letter as keyof typeof LETTER_VALUES], 0);

  return reduceNumber(total);
}

export function buildNumerologyContext(
  input: NumerologyContextInput,
): NumerologyContext {
  const birth = parseDateParts(input.birth_date);
  const target = parseDateParts(input.date);

  // Deterministic numerology using standard digit reduction with master numbers
  // 11, 22, and 33 preserved when they appear as reduced totals.
  const lifePathNumber = reduceNumber(sumDigits(input.birth_date));
  const birthdayNumber = reduceNumber(birth.day);
  const attitudeNumber = reduceNumber(birth.month + birth.day);
  const nameNumber = getNameNumber(input.full_birth_name_for_numerology);
  const personalYear = reduceNumber(
    reduceNumber(birth.month) + reduceNumber(birth.day) + sumDigits(String(target.year)),
  );
  const personalMonth = reduceNumber(personalYear + target.month);
  const personalDay = reduceNumber(personalMonth + target.day);

  return {
    life_path_number: lifePathNumber,
    birthday_number: birthdayNumber,
    attitude_number: attitudeNumber,
    name_number: nameNumber,
    personal_year: personalYear,
    personal_month: personalMonth,
    personal_day: personalDay,
    limitations: [
      "Numerology values are deterministic digit-reduction calculations derived from birth date and target date.",
      "Name-based numerology normalizes the stored full birth name by uppercasing, removing accents, and ignoring spaces and punctuation before letter-to-number conversion.",
      "This layer is interpretive numerology, not astronomical or location-based calculation.",
      ...(nameNumber === null
        ? [
            "Name number could not be computed because the birth-name input was missing or did not contain letters that map cleanly into the current A-Z numerology table.",
          ]
        : []),
    ],
  };
}
