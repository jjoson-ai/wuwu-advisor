import { Text, type StyleProp, type TextStyle, View } from "react-native";

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

    if (current && (candidate.length > 150 || sentenceCount >= 2)) {
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

export function splitIntoParagraphs(text: string) {
  const normalized = text.trim();

  if (normalized === "") {
    return [];
  }

  return normalized
    .split(/\n{2,}/)
    .flatMap((block) => splitBlockIntoParagraphs(block.replace(/\s+/g, " ").trim()))
    .filter(Boolean);
}

export function StructuredCopy({
  text,
  textStyle,
  gap = 10,
  formatText,
}: {
  text: string;
  textStyle: StyleProp<TextStyle>;
  gap?: number;
  formatText?: (text: string) => string;
}) {
  const paragraphs = splitIntoParagraphs(formatText ? formatText(text) : text);

  if (paragraphs.length === 0) {
    return null;
  }

  return (
    <View style={{ gap }}>
      {paragraphs.map((paragraph, index) => (
        <Text key={`${paragraph}-${index}`} style={textStyle}>
          {paragraph}
        </Text>
      ))}
    </View>
  );
}
