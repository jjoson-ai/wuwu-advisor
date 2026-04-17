export type DisplaySection = {
  title: string;
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

export function splitDisplayParagraphs(text: string) {
  const normalized = text.trim();

  if (normalized === "") {
    return [];
  }

  return normalized
    .split(/\n{2,}/)
    .flatMap((block) => splitBlockIntoParagraphs(normalizeWhitespace(block)))
    .filter(Boolean);
}

function parseExplicitLabel(paragraph: string, titles: readonly string[]) {
  const normalizedTitles = titles.map((title) => title.toLowerCase());
  const match = paragraph.match(/^([^:\-]{2,60})\s*[:\-]\s*/);

  if (match === null) {
    return null;
  }

  const normalizedLabel = match[1].trim().toLowerCase();
  const titleIndex = normalizedTitles.indexOf(normalizedLabel);

  if (titleIndex === -1) {
    return null;
  }

  return {
    title: titles[titleIndex],
    body: paragraph.slice(match[0].length).trim(),
  };
}

export function formatNarrativeSectionsForDisplay(params: {
  text: string;
  titles: readonly string[];
}) {
  const paragraphs = splitDisplayParagraphs(params.text);

  if (paragraphs.length === 0) {
    return [] as DisplaySection[];
  }

  const explicitSections = paragraphs
    .map((paragraph) => parseExplicitLabel(paragraph, params.titles))
    .filter((section): section is DisplaySection => section !== null);

  if (explicitSections.length >= 2) {
    return explicitSections;
  }

  if (paragraphs.length === 1) {
    return [{ title: params.titles[0] ?? "Overview", body: paragraphs[0] }];
  }

  const sectionCount = Math.min(params.titles.length, paragraphs.length);
  const sections: DisplaySection[] = [];

  for (let index = 0; index < sectionCount; index += 1) {
    const body = paragraphs[index];
    const title = params.titles[index];

    if (body == null || title == null) {
      continue;
    }

    sections.push({ title, body });
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
