const NUMEROLOGY_BODY_DESCRIPTORS: Record<string, string> = {
  "1": "initiative",
  "2": "partnership",
  "3": "expression",
  "4": "structure",
  "5": "change",
  "6": "responsibility",
  "7": "reflection",
  "8": "material drive",
  "9": "completion",
  "11": "heightened insight",
  "22": "building at scale",
  "33": "care and teaching",
};

type NumerologyMentionKey =
  | "personal_year"
  | "personal_month"
  | "personal_day";

function formatMention(
  label: "Personal Year" | "Personal Month" | "Personal Day",
  key: NumerologyMentionKey,
  value: string | undefined,
  seen: Set<NumerologyMentionKey>,
) {
  if (value == null || value.trim() === "") {
    return null;
  }

  const normalized = value.trim();
  const descriptor = NUMEROLOGY_BODY_DESCRIPTORS[normalized];

  if (seen.has(key)) {
    return `${label} ${normalized}`;
  }

  seen.add(key);

  if (descriptor == null) {
    return `${label} ${normalized}`;
  }

  return `${label} ${normalized} (${descriptor})`;
}

export function createNumerologyMentionFormatter() {
  const seen = new Set<NumerologyMentionKey>();

  return (text: string) => {
    if (text.trim() === "") {
      return text;
    }

    let nextText = text;

    nextText = nextText.replace(
      /\bPersonal Year\s+(\d{1,2})(\s*\/\s*Month\s+(\d{1,2}))?(\s*\/\s*Day\s+(\d{1,2}))?/gi,
      (_, yearValue: string, monthGroup: string, monthValue: string, dayGroup: string, dayValue: string) => {
        const parts = [
          formatMention("Personal Year", "personal_year", yearValue, seen),
        ];

        if (monthGroup) {
          parts.push(formatMention("Personal Month", "personal_month", monthValue, seen));
        }

        if (dayGroup) {
          parts.push(formatMention("Personal Day", "personal_day", dayValue, seen));
        }

        return parts.filter(Boolean).join(" / ");
      },
    );

    nextText = nextText.replace(
      /\bPersonal Month\s+(\d{1,2})(\s*\/\s*Day\s+(\d{1,2}))?/gi,
      (_, monthValue: string, dayGroup: string, dayValue: string) => {
        const parts = [
          formatMention("Personal Month", "personal_month", monthValue, seen),
        ];

        if (dayGroup) {
          parts.push(formatMention("Personal Day", "personal_day", dayValue, seen));
        }

        return parts.filter(Boolean).join(" / ");
      },
    );

    nextText = nextText.replace(
      /\bPersonal Day\s+(\d{1,2})\b/gi,
      (_, dayValue: string) =>
        formatMention("Personal Day", "personal_day", dayValue, seen) ??
        `Personal Day ${dayValue}`,
    );

    return nextText;
  };
}
