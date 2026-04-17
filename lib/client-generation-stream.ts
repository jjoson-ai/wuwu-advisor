export type SSEClientEvent =
  | { type: "stage"; label: string }
  | { type: "chunk"; text: string }
  | { type: "done"; payload: unknown }
  | { type: "error"; message: string };

export async function* readGenerationStream(
  response: Response,
): AsyncGenerator<SSEClientEvent> {
  if (!response.body) {
    throw new Error("No response body.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();

      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split("\n\n");
      buffer = parts.pop() ?? "";

      for (const part of parts) {
        for (const line of part.split("\n")) {
          if (line.startsWith("data: ")) {
            try {
              yield JSON.parse(line.slice(6)) as SSEClientEvent;
            } catch {
              // skip malformed lines
            }
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
