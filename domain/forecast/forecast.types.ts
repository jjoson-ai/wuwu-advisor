import { z } from "zod";
import type { NumerologyGenerationData } from "@/domain/numerology/numerology.agent";
import type { AccessLevel } from "@/lib/access";

export const DEFAULT_FORECAST_HORIZON_DAYS = 30;
export const DEFAULT_FORECAST_HORIZON_LABEL = "Next 30 days";
export const FREE_FORECAST_SUMMARY_TITLES = [
  "What’s unfolding this month",
  "What is gaining momentum",
  "What to build steadily",
  "What to avoid forcing",
  "Likely turning point",
] as const;
export const PAID_FORECAST_SUMMARY_TITLES = [
  "What’s unfolding this month",
  "Current phase",
  "What is gaining momentum",
  "What to build steadily",
  "What to avoid forcing",
  "Likely turning point",
] as const;

export type ForecastHorizon = {
  label: string;
  days: number;
  start_date: string;
  end_date: string;
};

export function buildForecastHorizon(startDate: string): ForecastHorizon {
  const start = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + DEFAULT_FORECAST_HORIZON_DAYS - 1);

  return {
    label: DEFAULT_FORECAST_HORIZON_LABEL,
    days: DEFAULT_FORECAST_HORIZON_DAYS,
    start_date: startDate,
    end_date: end.toISOString().slice(0, 10),
  };
}

export const ForecastSectionSchema = z.object({
  headline: z.string(),
  description: z.string(),
});

export const FreeForecastSchema = z.object({
  title: z.string(),
  summary: z.string(),
});

export const ForecastSchema = z.object({
  title: z.string(),
  summary: z.string(),
  current_phase: ForecastSectionSchema,
  career_and_money: ForecastSectionSchema,
  relationships: ForecastSectionSchema,
  energy_and_pacing: ForecastSectionSchema,
  best_use_of_this_period: ForecastSectionSchema,
  what_to_avoid: ForecastSectionSchema,
});

export type Forecast = z.infer<typeof ForecastSchema>;
export type FreeForecast = z.infer<typeof FreeForecastSchema>;

const HIDDEN_FORECAST_SECTION: Forecast["current_phase"] = {
  headline: "Locked on free tier",
  description: "Regenerate with fuller access to load this section.",
};

export function expandFreeForecastToForecast(
  forecast: FreeForecast,
): Forecast {
  return {
    ...forecast,
    current_phase: HIDDEN_FORECAST_SECTION,
    career_and_money: HIDDEN_FORECAST_SECTION,
    relationships: HIDDEN_FORECAST_SECTION,
    energy_and_pacing: HIDDEN_FORECAST_SECTION,
    best_use_of_this_period: HIDDEN_FORECAST_SECTION,
    what_to_avoid: HIDDEN_FORECAST_SECTION,
  };
}

function normalizeSentence(text: string) {
  const normalized = text.replace(/\s+/g, " ").trim();

  if (normalized === "") {
    return "";
  }

  return /[.!?]$/.test(normalized) ? normalized : `${normalized}.`;
}

function splitIntoSentences(text: string) {
  return text
    .replace(/\s+/g, " ")
    .trim()
    .split(/(?<=[.!?])\s+(?=[A-Z0-9"])/)
    .map((sentence) => normalizeSentence(sentence))
    .filter(Boolean);
}

function parseExplicitFreeForecastBlocks(summary: string) {
  const normalizedTitles = FREE_FORECAST_SUMMARY_TITLES.map((title) =>
    title.toLowerCase(),
  );
  const rawBlocks = summary
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);
  const sections: Array<{ title: string; body: string }> = [];
  let pendingTitle: string | null = null;

  for (const block of rawBlocks) {
    const directMatch = block.match(/^([^:\n]{2,80})\s*:\s*([\s\S]+)$/);

    if (directMatch) {
      const titleIndex = normalizedTitles.indexOf(
        directMatch[1].trim().toLowerCase(),
      );

      if (titleIndex !== -1) {
        const sentence = splitIntoSentences(directMatch[2])[0];

        if (sentence) {
          sections.push({
            title: FREE_FORECAST_SUMMARY_TITLES[titleIndex],
            body: sentence,
          });
        }
        pendingTitle = null;
        continue;
      }
    }

    const titleIndex = normalizedTitles.indexOf(block.toLowerCase());

    if (titleIndex !== -1) {
      pendingTitle = FREE_FORECAST_SUMMARY_TITLES[titleIndex];
      continue;
    }

    if (pendingTitle) {
      const sentence = splitIntoSentences(block)[0];

      if (sentence) {
        sections.push({ title: pendingTitle, body: sentence });
      }
      pendingTitle = null;
    }
  }

  return sections.slice(0, FREE_FORECAST_SUMMARY_TITLES.length);
}

function deriveFreeForecastMonthThesis(summary: string) {
  const firstParagraph = summary
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .find(Boolean);

  if (!firstParagraph) {
    return "";
  }

  const withoutKnownLabel = firstParagraph.replace(
    /^([^:\n]{2,80})\s*:\s*/,
    (match, rawLabel: string) => {
      const normalizedLabel = String(rawLabel).trim().toLowerCase();
      const isKnownLabel = FREE_FORECAST_SUMMARY_TITLES.some(
        (title) => title.toLowerCase() === normalizedLabel,
      );

      return isKnownLabel ? "" : match;
    },
  );

  return splitIntoSentences(withoutKnownLabel)[0] ?? "";
}

const PAID_FORECAST_EDITORIAL_LABEL_MAP = new Map<
  string,
  (typeof PAID_FORECAST_SUMMARY_TITLES)[number] | null
>([
  ["dominant pattern", PAID_FORECAST_SUMMARY_TITLES[0]],
  ["where effort belongs", PAID_FORECAST_SUMMARY_TITLES[3]],
  ["what is accumulating", PAID_FORECAST_SUMMARY_TITLES[2]],
  ["what to delay", PAID_FORECAST_SUMMARY_TITLES[4]],
  ["key tension", null],
]);

function normalizeForecastSummaryLabel(rawLabel: string) {
  return rawLabel.replace(/^\*+|\*+$/g, "").trim().toLowerCase();
}

function appendPaidSummarySectionBody(
  sectionsByTitle: Map<string, string[]>,
  title: (typeof PAID_FORECAST_SUMMARY_TITLES)[number],
  body: string,
) {
  const normalizedBody = body.replace(/\s+/g, " ").trim();

  if (normalizedBody === "") {
    return;
  }

  const existing = sectionsByTitle.get(title) ?? [];
  sectionsByTitle.set(title, [...existing, normalizedBody]);
}

export function normalizeFreeForecastSummary(summary: string) {
  const explicitSections = parseExplicitFreeForecastBlocks(summary);

  if (explicitSections.length >= 1) {
    const explicitByTitle = new Map(
      explicitSections.map((section) => [section.title, section.body]),
    );
    const orderedSections = FREE_FORECAST_SUMMARY_TITLES.map((title, index) => {
      const body =
        explicitByTitle.get(title) ??
        (index === 0 ? deriveFreeForecastMonthThesis(summary) : "");

      if (!body) {
        return null;
      }

      return { title, body };
    }).filter(
      (
        section,
      ): section is { title: (typeof FREE_FORECAST_SUMMARY_TITLES)[number]; body: string } =>
        section !== null,
    );

    if (orderedSections.length >= 2) {
      return orderedSections
        .map((section) => `${section.title}: ${section.body}`)
        .join("\n\n");
    }
  }

  const sentences = splitIntoSentences(summary).slice(
    0,
    FREE_FORECAST_SUMMARY_TITLES.length,
  );

  if (sentences.length === 0) {
    return "";
  }

  return sentences
    .map((sentence, index) => {
      const title = FREE_FORECAST_SUMMARY_TITLES[index];
      return title ? `${title}: ${sentence}` : sentence;
    })
    .join("\n\n");
}

export function normalizePaidForecastSummary(summary: string) {
  const blocks = summary
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);

  if (blocks.length === 0) {
    return "";
  }

  const sectionsByTitle = new Map<string, string[]>();
  const leadingUnlabeledBlocks: string[] = [];
  let sawStructuredLabel = false;
  let activeTitle: (typeof PAID_FORECAST_SUMMARY_TITLES)[number] | null = null;

  for (const block of blocks) {
    const directMatch = block.match(/^\*{0,2}([^:\n]{2,80}?)\*{0,2}\s*:\s*([\s\S]+)$/);

    if (directMatch) {
      const rawLabel = normalizeForecastSummaryLabel(directMatch[1]);
      const directTitle = PAID_FORECAST_SUMMARY_TITLES.find(
        (title) => title.toLowerCase() === rawLabel,
      );

      if (directTitle) {
        sawStructuredLabel = true;
        activeTitle = directTitle;
        appendPaidSummarySectionBody(sectionsByTitle, directTitle, directMatch[2]);
        continue;
      }

      if (PAID_FORECAST_EDITORIAL_LABEL_MAP.has(rawLabel)) {
        sawStructuredLabel = true;
        const mappedTitle = PAID_FORECAST_EDITORIAL_LABEL_MAP.get(rawLabel);

        if (mappedTitle) {
          activeTitle = mappedTitle;
          appendPaidSummarySectionBody(sectionsByTitle, mappedTitle, directMatch[2]);
        } else {
          activeTitle = null;
        }
        continue;
      }
    }

    const standaloneTitle = PAID_FORECAST_SUMMARY_TITLES.find(
      (title) => title.toLowerCase() === normalizeForecastSummaryLabel(block),
    );

    if (standaloneTitle) {
      sawStructuredLabel = true;
      activeTitle = standaloneTitle;
      continue;
    }

    if (activeTitle) {
      appendPaidSummarySectionBody(sectionsByTitle, activeTitle, block);
      continue;
    }

    if (sawStructuredLabel) {
      continue;
    }

    leadingUnlabeledBlocks.push(block);
  }

  if (sawStructuredLabel === false) {
    return summary;
  }

  if (
    sectionsByTitle.has(PAID_FORECAST_SUMMARY_TITLES[0]) === false &&
    leadingUnlabeledBlocks.length > 0
  ) {
    appendPaidSummarySectionBody(
      sectionsByTitle,
      PAID_FORECAST_SUMMARY_TITLES[0],
      leadingUnlabeledBlocks[0],
    );
  }

  const normalizedSections = PAID_FORECAST_SUMMARY_TITLES.map((title) => {
    const bodies = sectionsByTitle.get(title);

    if (!bodies || bodies.length === 0) {
      return null;
    }

    return {
      title,
      body: bodies.join(" "),
    };
  }).filter(
    (
      section,
    ): section is { title: (typeof PAID_FORECAST_SUMMARY_TITLES)[number]; body: string } =>
      section !== null,
  );

  return normalizedSections
    .map((section) => `${section.title}: ${section.body}`)
    .join("\n\n");
}

export type UserForecastRow = {
  id: string;
  user_id: string;
  forecast_json: Forecast;
  numerology_context_json: NumerologyGenerationData | null;
  generation_access_level: AccessLevel | null;
  created_at: string;
  updated_at: string;
};

export type FormattedForecast = Forecast & {
  id: string;
  generation_access_level: AccessLevel | null;
  created_at: string;
  updated_at: string;
};
