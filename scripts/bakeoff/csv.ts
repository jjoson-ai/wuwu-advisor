function escapeCell(value: string) {
  if (value.includes('"') || value.includes(",") || value.includes("\n")) {
    return `"${value.replaceAll('"', '""')}"`;
  }

  return value;
}

export function toCsv(
  rows: Array<Record<string, string | number | null | undefined>>,
  orderedColumns?: string[],
) {
  if (rows.length === 0) {
    return "";
  }

  const columns = orderedColumns ?? Object.keys(rows[0]);
  const lines = [columns.join(",")];

  for (const row of rows) {
    lines.push(
      columns
        .map((column) => {
          const rawValue = row[column];

          if (rawValue == null) {
            return "";
          }

          return escapeCell(String(rawValue));
        })
        .join(","),
    );
  }

  return `${lines.join("\n")}\n`;
}

export function parseCsv(text: string) {
  const rows: string[][] = [];
  let currentCell = "";
  let currentRow: string[] = [];
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    const nextCharacter = text[index + 1];

    if (inQuotes) {
      if (character === '"' && nextCharacter === '"') {
        currentCell += '"';
        index += 1;
        continue;
      }

      if (character === '"') {
        inQuotes = false;
        continue;
      }

      currentCell += character;
      continue;
    }

    if (character === '"') {
      inQuotes = true;
      continue;
    }

    if (character === ",") {
      currentRow.push(currentCell);
      currentCell = "";
      continue;
    }

    if (character === "\n") {
      currentRow.push(currentCell);
      currentCell = "";

      if (currentRow.some((value) => value !== "")) {
        rows.push(currentRow);
      }

      currentRow = [];
      continue;
    }

    if (character === "\r") {
      continue;
    }

    currentCell += character;
  }

  if (currentCell !== "" || currentRow.length > 0) {
    currentRow.push(currentCell);
    rows.push(currentRow);
  }

  if (rows.length === 0) {
    return [];
  }

  const [header, ...body] = rows;

  return body.map((row) =>
    Object.fromEntries(
      header.map((column, index) => [column, row[index] ?? ""]),
    ),
  );
}
