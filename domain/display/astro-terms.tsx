import type { ReactNode } from "react";

const MULTI_WORD_TERMS = [
  "Manifesting Generator",
  "North Node",
  "South Node",
  "Day Master",
  "Four Pillars",
  "Yin Wood",
  "Yang Wood",
  "Yin Fire",
  "Yang Fire",
  "Yin Earth",
  "Yang Earth",
  "Yin Metal",
  "Yang Metal",
  "Yin Water",
  "Yang Water",
  "Human Design",
];

const SINGLE_WORD_TERMS = [
  "Aries",
  "Taurus",
  "Gemini",
  "Cancer",
  "Leo",
  "Virgo",
  "Libra",
  "Scorpio",
  "Sagittarius",
  "Capricorn",
  "Aquarius",
  "Pisces",
  "Sun",
  "Moon",
  "Mercury",
  "Venus",
  "Mars",
  "Jupiter",
  "Saturn",
  "Uranus",
  "Neptune",
  "Pluto",
  "Ascendant",
  "Rising",
  "Midheaven",
  "Manifestor",
  "Projector",
  "Reflector",
  "Generator",
  "Tiger",
  "Rabbit",
  "Dragon",
  "Snake",
  "Horse",
  "Goat",
  "Monkey",
  "Rooster",
  "Rat",
  "Ox",
  "Dog",
  "Pig",
  "Jia",
  "Bing",
  "Ding",
  "Geng",
  "BaZi",
];

const STRUCTURAL_PATTERN_SOURCES = [
  String.raw`\bLife Path \d{1,2}\b`,
  String.raw`\bPersonal (?:Year|Month|Day) \d{1,2}(?:\s*\([^)]+\))?`,
  String.raw`\b\d{1,2} (?:Birthday|Attitude|Name|Expression|Soul Urge|Personality|Heart|Destiny)\b`,
];

function escapeRegex(source: string): string {
  return source.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const COMBINED_PATTERN_SOURCE = [
  ...STRUCTURAL_PATTERN_SOURCES,
  ...MULTI_WORD_TERMS.map((term) => `\\b${escapeRegex(term)}\\b`),
  `\\b(?:${SINGLE_WORD_TERMS.map(escapeRegex).join("|")})\\b`,
].join("|");

export function highlightAstroTerms(
  text: string,
  keyPrefix = "astro",
): ReactNode[] {
  if (text === "") {
    return [text];
  }

  const pattern = new RegExp(COMBINED_PATTERN_SOURCE, "g");
  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  let matchCount = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }
    nodes.push(
      <strong
        key={`${keyPrefix}-${matchCount}-${match.index}`}
        className="astro-term"
      >
        {match[0]}
      </strong>,
    );
    matchCount += 1;
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes.length === 0 ? [text] : nodes;
}
