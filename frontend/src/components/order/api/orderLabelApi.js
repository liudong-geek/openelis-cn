import config from "../../../config.json";
import { getRequestLocale } from "../../utils/LocaleUtils";
import { forgetLabels, labelFailure, rememberLabels } from "../labelCheckpoint";

const keyOf = (item) => `${item?.type}:${item?.sampleItemId ?? ""}`;
const validId = (id) =>
  /^[1-9]\d{0,9}$/.test(String(id ?? "")) && Number(id) <= 2147483647;
const fail = (code = "UNCONFIRMED") => {
  throw labelFailure(code);
};

// The Provider binds this operation to a verified current snapshot. A legacy
// editable form is not authority to generate a label.
export async function generateOrderLabels(
  request,
  { isCurrent, barcodes, csrf } = {},
) {
  const labels = request?.labels;
  if (
    !validId(request?.orderId) ||
    typeof request?.labNumber !== "string" ||
    !request.labNumber.trim() ||
    !Array.isArray(labels) ||
    !labels.length ||
    labels.length > 100 ||
    labels.some(
      (item) =>
        !item ||
        !["order", "specimen"].includes(item.type) ||
        (item.type === "order"
          ? item.sampleItemId != null
          : !validId(item.sampleItemId)) ||
        !Number.isInteger(item.quantity) ||
        item.quantity < 1 ||
        item.quantity > 100,
    ) ||
    labels.reduce((sum, item) => sum + item.quantity, 0) > 100 ||
    new Set(labels.map(keyOf)).size !== labels.length
  )
    fail("INVALID_REQUEST");
  if (
    typeof isCurrent !== "function" ||
    !isCurrent() ||
    !csrf ||
    labels.some((item) => typeof barcodes?.[keyOf(item)] !== "string")
  )
    fail("STALE");
  const frozen = JSON.parse(
    JSON.stringify({
      orderId: String(request.orderId),
      labNumber: request.labNumber,
      labels: labels.map(({ type, sampleItemId, quantity }) => ({
        type,
        sampleItemId,
        quantity,
      })),
    }),
  );
  const expected = { ...barcodes };
  const body = JSON.stringify(frozen);
  const controller = new AbortController();
  let marker,
    dispatched = false,
    timer;
  try {
    const headers = {
      "Content-Type": "application/json",
      Accept: "application/json",
      "Accept-Language": getRequestLocale(),
      "X-CSRF-Token": csrf,
    };
    marker = rememberLabels();
    if (!isCurrent()) fail("STALE");
    const perform = async () => {
      dispatched = true;
      const response = await fetch(
        config.serverBaseUrl + "/rest/barcode/labels/generate",
        {
          method: "POST",
          body,
          headers,
          signal: controller.signal,
          credentials: "include",
          redirect: "manual",
          cache: "no-store",
        },
      );
      if (!isCurrent()) fail("STALE");
      if (response.status === 401) fail("UNAUTHORIZED");
      if (response.status === 403) fail("FORBIDDEN");
      // This endpoint has no attempt/rollback proof. Even 400 after dispatch
      // cannot authorize another count-consuming POST.
      if (
        response.status !== 200 ||
        response.redirected ||
        !response.headers.get("content-type")?.includes("application/json") ||
        Number(response.headers.get("content-length")) > 28500000 ||
        !response.body
      )
        fail();
      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8", { fatal: true });
      let text = "",
        size = 0;
      try {
        for (;;) {
          const chunk = await reader.read();
          if (!isCurrent() || controller.signal.aborted) fail("STALE");
          if (chunk.done) break;
          size += chunk.value.byteLength;
          if (size > 28500000) fail();
          text += decoder.decode(chunk.value, { stream: true });
        }
        text += decoder.decode();
      } finally {
        void reader.cancel().catch(() => {});
        reader.releaseLock();
      }
      const data = JSON.parse(text);
      if (
        data?.success === false ||
        String(data?.orderId) !== frozen.orderId ||
        data?.labNumber !== frozen.labNumber ||
        !Array.isArray(data.items) ||
        data.items.length !== frozen.labels.length ||
        new Set(data.items.map(keyOf)).size !== frozen.labels.length ||
        !Number.isInteger(data.totalGenerated) ||
        data.totalGenerated < 0
      )
        fail();
      const items = data.items.map((item) => {
        const requested = frozen.labels.find(
          (label) => keyOf(label) === keyOf(item),
        );
        if (
          !requested ||
          item.barcode !== expected[keyOf(item)] ||
          item.requestedQuantity !== requested.quantity ||
          !Number.isInteger(item.generatedQuantity) ||
          item.generatedQuantity < 0 ||
          item.generatedQuantity > requested.quantity ||
          (item.generatedQuantity < requested.quantity
            ? item.reason !== "PRINT_LIMIT"
            : item.reason !== null)
        )
          fail();
        return {
          type: requested.type,
          sampleItemId: requested.sampleItemId,
          barcode: item.barcode,
          requestedQuantity: requested.quantity,
          generatedQuantity: item.generatedQuantity,
          reason: item.reason,
        };
      });
      if (
        items.reduce((sum, item) => sum + item.generatedQuantity, 0) !==
        data.totalGenerated
      )
        fail();
      let pdf = null;
      if (data.totalGenerated > 0) {
        if (
          typeof data.pdfBase64 !== "string" ||
          data.pdfBase64.length > 28000000
        )
          fail();
        const binary = atob(data.pdfBase64);
        if (!binary.startsWith("%PDF-") || !binary.trimEnd().endsWith("%%EOF"))
          fail();
        pdf = new Blob(
          [Uint8Array.from(binary, (char) => char.charCodeAt(0))],
          { type: "application/pdf" },
        );
      } else if (data.pdfBase64 !== null) fail();
      if (!isCurrent() || controller.signal.aborted) fail("STALE");
      // Release the marker only after the current UI has acquired the file. A
      // Blob URL allocation failure must remain protected across remounts.
      return {
        items,
        totalGenerated: data.totalGenerated,
        pdf,
        confirmConsumed: () => {
          if (!isCurrent()) fail("STALE");
          forgetLabels(marker);
        },
      };
    };
    return await Promise.race([
      perform(),
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          controller.abort();
          reject(labelFailure("UNCONFIRMED"));
        }, 60000);
      }),
    ]);
  } catch (error) {
    if (!dispatched && marker) forgetLabels(marker);
    throw [
      "INVALID_REQUEST",
      "STALE",
      "UNAUTHORIZED",
      "FORBIDDEN",
      "STORAGE_UNAVAILABLE",
      "UNCONFIRMED",
    ].includes(error?.code)
      ? error
      : labelFailure("UNCONFIRMED");
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}
