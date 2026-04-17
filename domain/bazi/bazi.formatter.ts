import type { BaziChart } from "@/domain/bazi/context";

const HEAVENLY_STEMS = [
  { char: "甲", pinyin: "Jia", element: "Wood", polarity: "Yang" },
  { char: "乙", pinyin: "Yi", element: "Wood", polarity: "Yin" },
  { char: "丙", pinyin: "Bing", element: "Fire", polarity: "Yang" },
  { char: "丁", pinyin: "Ding", element: "Fire", polarity: "Yin" },
  { char: "戊", pinyin: "Wu", element: "Earth", polarity: "Yang" },
  { char: "己", pinyin: "Ji", element: "Earth", polarity: "Yin" },
  { char: "庚", pinyin: "Geng", element: "Metal", polarity: "Yang" },
  { char: "辛", pinyin: "Xin", element: "Metal", polarity: "Yin" },
  { char: "壬", pinyin: "Ren", element: "Water", polarity: "Yang" },
  { char: "癸", pinyin: "Gui", element: "Water", polarity: "Yin" },
] as const;

const EARTHLY_BRANCHES = [
  { char: "子", pinyin: "Zi", animal: "Rat" },
  { char: "丑", pinyin: "Chou", animal: "Ox" },
  { char: "寅", pinyin: "Yin", animal: "Tiger" },
  { char: "卯", pinyin: "Mao", animal: "Rabbit" },
  { char: "辰", pinyin: "Chen", animal: "Dragon" },
  { char: "巳", pinyin: "Si", animal: "Snake" },
  { char: "午", pinyin: "Wu", animal: "Horse" },
  { char: "未", pinyin: "Wei", animal: "Goat" },
  { char: "申", pinyin: "Shen", animal: "Monkey" },
  { char: "酉", pinyin: "You", animal: "Rooster" },
  { char: "戌", pinyin: "Xu", animal: "Dog" },
  { char: "亥", pinyin: "Hai", animal: "Pig" },
] as const;

function findStemByChar(value: string) {
  return HEAVENLY_STEMS.find((stem) => stem.char === value) ?? null;
}

function findStemByPinyin(value: string) {
  const normalized = value.trim().toLowerCase();
  return (
    HEAVENLY_STEMS.find((stem) => stem.pinyin.toLowerCase() === normalized) ?? null
  );
}

function findBranchByChar(value: string) {
  return EARTHLY_BRANCHES.find((branch) => branch.char === value) ?? null;
}

export function formatBaziDayMasterLabel(value: string) {
  const normalized = value.trim();

  if (normalized === "" || normalized === "unavailable") {
    return value;
  }

  const byChar = findStemByChar(normalized);

  if (byChar !== null) {
    return `${byChar.pinyin} (${byChar.polarity} ${byChar.element}, ${byChar.char})`;
  }

  const firstToken = normalized.split(/\s+/)[0] ?? "";
  const byPinyin = findStemByPinyin(firstToken);

  if (byPinyin !== null) {
    return `${byPinyin.pinyin} (${byPinyin.polarity} ${byPinyin.element}, ${byPinyin.char})`;
  }

  return normalized;
}

export function formatBaziPillarLabel(value: string) {
  const normalized = value.trim();

  if (normalized.length !== 2) {
    return normalized;
  }

  const stem = findStemByChar(normalized[0] ?? "");
  const branch = findBranchByChar(normalized[1] ?? "");

  if (stem === null || branch === null) {
    return normalized;
  }

  return `${normalized} (${stem.pinyin} ${branch.animal})`;
}

export function formatBaziChartForPrompt(chart: BaziChart | null) {
  if (chart === null) {
    return null;
  }

  return {
    day_master: chart.day_master,
    day_master_readable: formatBaziDayMasterLabel(chart.day_master),
    year_pillar: chart.year_pillar,
    year_pillar_readable: formatBaziPillarLabel(chart.year_pillar),
    month_pillar: chart.month_pillar,
    month_pillar_readable: formatBaziPillarLabel(chart.month_pillar),
    day_pillar: chart.day_pillar,
    day_pillar_readable: formatBaziPillarLabel(chart.day_pillar),
    hour_pillar: chart.hour_pillar,
    hour_pillar_readable: formatBaziPillarLabel(chart.hour_pillar),
    five_element_balance: chart.five_element_balance,
    favorable_element: chart.favorable_element,
  };
}
