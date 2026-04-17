const BLUEPRINT_SUMMARY_SECTION_TITLES = [
  "Overview",
  "How you operate",
  "Your strengths",
  "Your growth edge",
  "Your natural rhythm",
] as const;

const NEUTRAL_LATE_SECTION_TITLES = [
  "More about your pattern",
  "How this shows up",
] as const;

const LABEL_TO_TITLE = new Map<string, (typeof BLUEPRINT_SUMMARY_SECTION_TITLES)[number]>([
  ["overview", "Overview"],
  ["how you operate", "How you operate"],
  ["your strengths", "Your strengths"],
  ["your growth edge", "Your growth edge"],
  ["your natural rhythm", "Your natural rhythm"],
]);

export type BlueprintDisplaySection = {
  title:
    | (typeof BLUEPRINT_SUMMARY_SECTION_TITLES)[number]
    | (typeof NEUTRAL_LATE_SECTION_TITLES)[number];
  body: string;
};

function normalizeWhitespace(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

function splitBlockIntoParagraphs(block: string) {
  const sentences = block
    .split(/(?<=[.!?])\s+(?=[A-Z0-9"])/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);

  if (sentences.length <= 1) {
    return [block];
  }

  const paragraphs: string[] = [];
  let current = "";
  let sentenceCount = 0;

  for (const sentence of sentences) {
    const candidate = current ? `${current} ${sentence}` : sentence;

    if (current && (candidate.length > 180 || sentenceCount >= 2)) {
      paragraphs.push(current);
      current = sentence;
      sentenceCount = 1;
      continue;
    }

    current = candidate;
    sentenceCount += 1;
  }

  if (current) {
    paragraphs.push(current);
  }

  return paragraphs;
}

function parseExplicitLabel(paragraph: string): BlueprintDisplaySection | null {
  const match = paragraph.match(
    /^(overview|how you operate|your strengths|your growth edge|your natural rhythm)\s*[:\-]\s*/i,
  );

  if (match === null) {
    return null;
  }

  const title = LABEL_TO_TITLE.get(match[1].trim().toLowerCase());

  if (title == null) {
    return null;
  }

  return {
    title,
    body: paragraph.slice(match[0].length).trim(),
  };
}

function supportsGrowthEdgeLabel(text: string) {
  return /\b(growth|growing|edge|stretch|lesson|blind spot|pattern to watch|tendency to soften|tendency to temper|can learn)\b/i.test(
    text,
  );
}

function supportsNaturalRhythmLabel(text: string) {
  return /\b(rhythm|pace|pacing|cycle|cadence|timing|timed|when you|under pressure|best when|energy|recharge|restore)\b/i.test(
    text,
  );
}

export function splitBlueprintNarrativeIntoParagraphs(text: string) {
  const normalized = text.trim();

  if (normalized === "") {
    return [];
  }

  return normalized
    .split(/\n{2,}/)
    .flatMap((block) => splitBlockIntoParagraphs(normalizeWhitespace(block)))
    .filter(Boolean);
}

export function formatBlueprintSummaryForDisplay(text: string): BlueprintDisplaySection[] {
  const paragraphs = splitBlueprintNarrativeIntoParagraphs(text);

  if (paragraphs.length === 0) {
    return [];
  }

  const explicitSections = paragraphs
    .map((paragraph) => parseExplicitLabel(paragraph))
    .filter((section): section is BlueprintDisplaySection => section !== null);

  if (explicitSections.length >= 2) {
    return explicitSections;
  }

  if (paragraphs.length === 1) {
    return [{ title: "Overview", body: paragraphs[0] }];
  }

  const sectionCount = Math.min(
    BLUEPRINT_SUMMARY_SECTION_TITLES.length,
    Math.max(2, paragraphs.length),
  );
  const sections: BlueprintDisplaySection[] = [];

  for (let index = 0; index < sectionCount; index += 1) {
    const body = paragraphs[index];

    if (body == null) {
      continue;
    }

    let title:
      | (typeof BLUEPRINT_SUMMARY_SECTION_TITLES)[number]
      | (typeof NEUTRAL_LATE_SECTION_TITLES)[number];

    if (index <= 2) {
      title = BLUEPRINT_SUMMARY_SECTION_TITLES[index];
    } else if (index === 3) {
      title = supportsGrowthEdgeLabel(body)
        ? "Your growth edge"
        : "More about your pattern";
    } else {
      title = supportsNaturalRhythmLabel(body)
        ? "Your natural rhythm"
        : "How this shows up";
    }

    sections.push({
      title,
      body,
    });
  }

  if (paragraphs.length > sectionCount && sections.length > 0) {
    const trailing = paragraphs.slice(sectionCount).join("\n\n");
    const lastSection = sections.at(-1);

    if (lastSection) {
      lastSection.body = `${lastSection.body}\n\n${trailing}`;
    }
  }

  return sections;
}
