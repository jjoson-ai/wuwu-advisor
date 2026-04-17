export type SSEEvent =
  | { type: "stage"; label: string }
  | { type: "chunk"; text: string }
  | { type: "done"; payload: unknown }
  | { type: "error"; message: string };

export function createSSEStream() {
  const encoder = new TextEncoder();
  let streamController: ReadableStreamDefaultController<Uint8Array>;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      streamController = controller;
    },
  });

  function send(event: SSEEvent) {
    streamController.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
  }

  function close() {
    streamController.close();
  }

  const response = new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });

  return { send, close, response };
}
