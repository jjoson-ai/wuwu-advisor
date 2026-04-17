import {
  formatBaziDayMasterLabel,
  formatBaziPillarLabel,
} from "@/domain/bazi/bazi.formatter";
import { getBlueprintLabelExplanation } from "@/domain/blueprint/blueprint-label-explanations";

type ExplainedValue = {
  value: string;
  explanation: string | null;
};

type GuidingNumberKey =
  | "life_path"
  | "birthday"
  | "attitude"
  | "name_number";

type ChineseSignatureKey = "animal" | "element" | "polarity";

type BaziKey =
  | "day_master"
  | "year_pillar"
  | "month_pillar"
  | "day_pillar"
  | "hour_pillar";

const NUMEROLOGY_DESCRIPTORS: Record<string, string> = {
  "1": "Initiative",
  "2": "Partnership",
  "3": "Expression",
  "4": "Structure",
  "5": "Change",
  "6": "Responsibility",
  "7": "Reflection",
  "8": "Material drive",
  "9": "Completion",
  "11": "Heightened insight",
  "22": "Building at scale",
  "33": "Care and teaching",
};

const ANIMAL_DESCRIPTORS: Record<string, string> = {
  rat: "Quick adaptation",
  ox: "Steady endurance",
  tiger: "Bold initiative",
  rabbit: "Tact and sensitivity",
  dragon: "Visible momentum",
  snake: "Strategic discernment",
  horse: "Independent drive",
  goat: "Thoughtful care",
  monkey: "Quick ingenuity",
  rooster: "Precision and refinement",
  dog: "Protective loyalty",
  pig: "Receptive ease",
};

const ELEMENT_DESCRIPTORS: Record<string, string> = {
  wood: "Growth",
  fire: "Drive",
  earth: "Grounding",
  metal: "Precision",
  water: "Adaptability",
};

const POLARITY_DESCRIPTORS: Record<string, string> = {
  yang: "Outward-moving",
  yin: "Inward and receptive",
};

const PILLAR_ROLE_DESCRIPTORS: Record<BaziKey, string> = {
  day_master: "Core operating style",
  year_pillar: "Outer context",
  month_pillar: "Work / responsibilities",
  day_pillar: "Core self / close bonds",
  hour_pillar: "Inner drive / later growth",
};

const BAZI_ELEMENT_DESCRIPTORS: Record<string, string> = {
  wood: "growth",
  fire: "drive",
  earth: "stability",
  metal: "precision",
  water: "adaptability",
};

const BAZI_ANIMAL_DESCRIPTORS: Record<string, string> = {
  rat: "quick adaptation",
  ox: "steady endurance",
  tiger: "bold initiative",
  rabbit: "tact and sensitivity",
  dragon: "visible momentum",
  snake: "strategic discernment",
  horse: "independent drive",
  goat: "thoughtful care",
  monkey: "quick ingenuity",
  rooster: "precision and refinement",
  dog: "protective loyalty",
  pig: "receptive ease",
};

const BAZI_POLARITY_DESCRIPTORS: Record<string, string> = {
  yang: "outward-moving",
  yin: "inward and receptive",
};

const STEM_METADATA: Record<
  string,
  { pinyin: string; element: string; polarity: string }
> = {
  "甲": { pinyin: "Jia", element: "Wood", polarity: "Yang" },
  "乙": { pinyin: "Yi", element: "Wood", polarity: "Yin" },
  "丙": { pinyin: "Bing", element: "Fire", polarity: "Yang" },
  "丁": { pinyin: "Ding", element: "Fire", polarity: "Yin" },
  "戊": { pinyin: "Wu", element: "Earth", polarity: "Yang" },
  "己": { pinyin: "Ji", element: "Earth", polarity: "Yin" },
  "庚": { pinyin: "Geng", element: "Metal", polarity: "Yang" },
  "辛": { pinyin: "Xin", element: "Metal", polarity: "Yin" },
  "壬": { pinyin: "Ren", element: "Water", polarity: "Yang" },
  "癸": { pinyin: "Gui", element: "Water", polarity: "Yin" },
};

const BRANCH_METADATA: Record<string, { pinyin: string; animal: string }> = {
  "子": { pinyin: "Zi", animal: "Rat" },
  "丑": { pinyin: "Chou", animal: "Ox" },
  "寅": { pinyin: "Yin", animal: "Tiger" },
  "卯": { pinyin: "Mao", animal: "Rabbit" },
  "辰": { pinyin: "Chen", animal: "Dragon" },
  "巳": { pinyin: "Si", animal: "Snake" },
  "午": { pinyin: "Wu", animal: "Horse" },
  "未": { pinyin: "Wei", animal: "Goat" },
  "申": { pinyin: "Shen", animal: "Monkey" },
  "酉": { pinyin: "You", animal: "Rooster" },
  "戌": { pinyin: "Xu", animal: "Dog" },
  "亥": { pinyin: "Hai", animal: "Pig" },
};

function isMissingValue(value: string) {
  const normalized = value.trim().toLowerCase();
  return normalized === "" || normalized === "unknown" || normalized === "unavailable";
}

function titleCase(value: string) {
  if (value.trim() === "") {
    return value;
  }

  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
}

function appendDescriptor(value: string, descriptor: string | null) {
  if (descriptor == null || descriptor.trim() === "") {
    return value;
  }

  return `${value} — ${descriptor}`;
}

function getNormalizedBaziTokens(value: string) {
  return value
    .replace(/[()]/g, " ")
    .trim()
    .split(/\s+/)
    .map((token) => token.toLowerCase())
    .filter(Boolean);
}

function getStemMetadata(value: string) {
  const normalized = value.trim();

  if (normalized === "") {
    return null;
  }

  if (STEM_METADATA[normalized]) {
    return STEM_METADATA[normalized];
  }

  if (normalized.length >= 1 && STEM_METADATA[normalized[0] ?? ""]) {
    return STEM_METADATA[normalized[0] ?? ""];
  }

  const tokens = getNormalizedBaziTokens(normalized);

  return (
    Object.values(STEM_METADATA).find(
      (stem) => tokens.includes(stem.pinyin.toLowerCase()),
    ) ?? null
  );
}

function getBranchMetadata(value: string) {
  const normalized = value.trim();

  if (normalized.length >= 2 && BRANCH_METADATA[normalized[1] ?? ""]) {
    return BRANCH_METADATA[normalized[1] ?? ""];
  }

  const tokens = getNormalizedBaziTokens(normalized);

  return (
    Object.values(BRANCH_METADATA).find(
      (branch) =>
        tokens.includes(branch.pinyin.toLowerCase()) ||
        tokens.includes(branch.animal.toLowerCase()),
    ) ?? null
  );
}

function getBaziPillarDescriptor(value: string) {
  const stem = getStemMetadata(value);
  const branch = getBranchMetadata(value);

  if (stem && branch) {
    return `${
      BAZI_ELEMENT_DESCRIPTORS[stem.element.toLowerCase()]
    } with ${BAZI_ANIMAL_DESCRIPTORS[branch.animal.toLowerCase()]}`;
  }

  if (stem) {
    return `${BAZI_ELEMENT_DESCRIPTORS[stem.element.toLowerCase()]} emphasis`;
  }

  if (branch) {
    return `${BAZI_ANIMAL_DESCRIPTORS[branch.animal.toLowerCase()]} tone`;
  }

  return "combined element and animal pattern";
}

export function formatGuidingNumberValue(
  key: GuidingNumberKey,
  value: string,
): ExplainedValue {
  if (isMissingValue(value)) {
    return {
      value,
      explanation: getBlueprintLabelExplanation(key),
    };
  }

  return {
    value: appendDescriptor(value.trim(), NUMEROLOGY_DESCRIPTORS[value.trim()] ?? null),
    explanation: getBlueprintLabelExplanation(key),
  };
}

export function formatChineseSignatureValue(
  key: ChineseSignatureKey,
  value: string,
): ExplainedValue {
  if (isMissingValue(value)) {
    return {
      value,
      explanation: getBlueprintLabelExplanation(key),
    };
  }

  if (key === "animal") {
    const normalized = value.trim();
    return {
      value: appendDescriptor(
        normalized,
        ANIMAL_DESCRIPTORS[normalized.toLowerCase()] ?? null,
      ),
      explanation: getBlueprintLabelExplanation(key),
    };
  }

  if (key === "element") {
    const normalized = titleCase(value.trim());
    return {
      value: appendDescriptor(
        normalized,
        ELEMENT_DESCRIPTORS[normalized.toLowerCase()] ?? null,
      ),
      explanation: getBlueprintLabelExplanation(key),
    };
  }

  const normalized = titleCase(value.trim());
  return {
    value: appendDescriptor(
      normalized,
      POLARITY_DESCRIPTORS[normalized.toLowerCase()] ?? null,
    ),
    explanation: getBlueprintLabelExplanation(key),
  };
}

export function formatBaziValue(
  key: BaziKey,
  value: string,
): ExplainedValue {
  if (isMissingValue(value)) {
    return {
      value,
      explanation: getBlueprintLabelExplanation(key),
    };
  }

  if (key === "day_master") {
    const readable = formatBaziDayMasterLabel(value);
    const stem = getStemMetadata(value);
    const descriptor =
      stem == null
        ? PILLAR_ROLE_DESCRIPTORS[key]
        : `${BAZI_POLARITY_DESCRIPTORS[stem.polarity.toLowerCase()]} ${
            BAZI_ELEMENT_DESCRIPTORS[stem.element.toLowerCase()]
          }`;

    return {
      value: appendDescriptor(readable, descriptor),
      explanation: getBlueprintLabelExplanation(key),
    };
  }

  return {
    value: appendDescriptor(formatBaziPillarLabel(value), getBaziPillarDescriptor(value)),
    explanation: getBlueprintLabelExplanation(key),
  };
}
