export const MAX_JSON_BODY_BYTES = 65536;

// HTTP eligibility and domain error mapping belong to each transport.
export async function readBoundedJson(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  signal: AbortSignal,
  options: { invalidBody: () => Error; cancelOnComplete: boolean },
) {
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let size = 0,
    text = "",
    complete = false;
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) {
        complete = true;
        break;
      }
      size += chunk.value.byteLength;
      if (signal.aborted || size > MAX_JSON_BODY_BYTES)
        throw options.invalidBody();
      text += decoder.decode(chunk.value, { stream: true });
    }
    text += decoder.decode();
    if (signal.aborted) throw options.invalidBody();
    return JSON.parse(text);
  } finally {
    if (!complete || options.cancelOnComplete)
      void reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
