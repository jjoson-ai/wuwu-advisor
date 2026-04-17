import type { DailyBriefingInput } from "@/domain/astrology/schemas";

const ANIMALS = [
  "Rat",
  "Ox",
  "Tiger",
  "Rabbit",
  "Dragon",
  "Snake",
  "Horse",
  "Goat",
  "Monkey",
  "Rooster",
  "Dog",
  "Pig",
] as const;

const STEMS = [
  { element: "Wood", polarity: "yang" },
  { element: "Wood", polarity: "yin" },
  { element: "Fire", polarity: "yang" },
  { element: "Fire", polarity: "yin" },
  { element: "Earth", polarity: "yang" },
  { element: "Earth", polarity: "yin" },
  { element: "Metal", polarity: "yang" },
  { element: "Metal", polarity: "yin" },
  { element: "Water", polarity: "yang" },
  { element: "Water", polarity: "yin" },
] as const;

export type ChineseAstrologyContext = {
  zodiac_animal: (typeof ANIMALS)[number];
  element: (typeof STEMS)[number]["element"];
  yin_yang: (typeof STEMS)[number]["polarity"];
  limitations: string[];
};

export type ChineseAstrologySignal = {
  temperament: string;
  social_family_tone: string;
  change_orientation: string;
  limitations: string[];
};

type ChineseAstrologyInput = Pick<DailyBriefingInput, "birth_date">;

function getBirthYear(date: string) {
  return Number(date.slice(0, 4));
}

export function buildChineseAstrologyContext(
  input: ChineseAstrologyInput,
): ChineseAstrologyContext {
  const birthYear = getBirthYear(input.birth_date);

  // Deterministic first-pass Chinese astrology:
  // - zodiac animal, element, and yin/yang are mapped from birth year
  // - this is intentionally simplified to Gregorian birth year and does not
  //   adjust for Lunar New Year boundaries yet
  // - no Four Pillars, month/day/time pillars, or daily forecasting in this MVP
  const branchIndex = ((birthYear - 4) % 12 + 12) % 12;
  const stemIndex = ((birthYear - 4) % 10 + 10) % 10;
  const animal = ANIMALS[branchIndex];
  const stem = STEMS[stemIndex];

  return {
    zodiac_animal: animal,
    element: stem.element,
    yin_yang: stem.polarity,
    limitations: [
      "Chinese zodiac animal, element, and yin/yang are computed deterministically from birth year.",
      "This first pass uses Gregorian birth year and does not yet adjust for Lunar New Year boundary dates.",
      "No BaZi, Four Pillars, month pillar, day pillar, or time pillar is implemented yet.",
    ],
  };
}

export function buildChineseAstrologySignal(
  context: ChineseAstrologyContext,
): ChineseAstrologySignal {
  const temperamentByAnimal: Record<ChineseAstrologyContext["zodiac_animal"], string> = {
    Rat: "Quick to notice openings and often more adaptive than static.",
    Ox: "Steady, dependable, and more comfortable with consistency than sudden change.",
    Tiger: "Bold, instinctive, and more likely to move toward challenge than avoid it.",
    Rabbit: "Diplomatic, sensitive to atmosphere, and usually better with tact than force.",
    Dragon: "Large-scale in instinct, expressive, and often drawn to visible momentum.",
    Snake: "Strategic, private, and more inclined toward careful reading than blunt display.",
    Horse: "Independent, fast-moving, and often more energized by freedom than routine.",
    Goat: "Gentle, relational, and often guided by emotional texture and belonging.",
    Monkey: "Flexible, clever, and often more experimental than fixed in approach.",
    Rooster: "Precise, observant, and often drawn to order, standards, and practical correction.",
    Dog: "Loyal, principled, and more likely to anchor around trust than novelty.",
    Pig: "Open-hearted, generous, and often oriented toward ease, sincerity, and comfort.",
  };

  const socialToneByAnimal: Record<ChineseAstrologyContext["zodiac_animal"], string> = {
    Rat: "Often socially alert, responsive, and good at reading group shifts or family dynamics.",
    Ox: "Often shows care through reliability, follow-through, and practical presence.",
    Tiger: "Often comes across as direct, vivid, and hard to keep small in family or group settings.",
    Rabbit: "Often keeps connection smoother by softening edges and sensing what others need.",
    Dragon: "Often brings scale, confidence, or strong presence into social and family settings.",
    Snake: "Often connects through discernment, privacy, and selective trust rather than quick openness.",
    Horse: "Often needs room to move, speak plainly, and stay emotionally unboxed.",
    Goat: "Often values warmth, tenderness, and emotional safety in close bonds.",
    Monkey: "Often bonds through wit, responsiveness, and quick mental engagement.",
    Rooster: "Often brings candor, standards, and practical noticing into shared life.",
    Dog: "Often relates through loyalty, protectiveness, and steady moral presence.",
    Pig: "Often brings acceptance, softness, and generous feeling into connection.",
  };

  const changeOrientationByElement: Record<ChineseAstrologyContext["element"], string> = {
    Wood: "Leans toward growth, extension, and gradual forward movement over stagnation.",
    Fire: "Leans toward visibility, expression, and momentum over hesitation.",
    Earth: "Leans toward steadiness, maintenance, and grounded continuity over volatility.",
    Metal: "Leans toward structure, refinement, and clarity over looseness.",
    Water: "Leans toward adaptability, timing, and indirect movement over rigid force.",
  };

  return {
    temperament: temperamentByAnimal[context.zodiac_animal],
    social_family_tone: socialToneByAnimal[context.zodiac_animal],
    change_orientation: `${changeOrientationByElement[context.element]} ${context.yin_yang === "yang" ? "The yang polarity adds a more outward or initiating tone." : "The yin polarity adds a more inward, measured, or receptive tone."}`,
    limitations: context.limitations,
  };
}
