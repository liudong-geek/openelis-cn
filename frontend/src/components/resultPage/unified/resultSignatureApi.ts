import config from "../../../config.json";
import { getRequestLocale } from "../../utils/LocaleUtils";
import { readOpenElisResponse } from "../../utils/readOpenElisResponse";

type Fields = Record<string, unknown>;
type Operation = "sign" | "certify";
type Options = {
  username: string;
  userId: string | number;
  recordId: string | number;
  csrf: string;
  // The caller owns the immutable session / row epoch / edit revision binding.
  guard: () => boolean;
  onUnknown?: (event: { operation: Operation }) => void;
};

class ResultSignatureError extends Error {
  readonly messageId: string;
  constructor(
    readonly code: string,
    messageId = "esig.error.generic",
  ) {
    // Neither transport exceptions nor response bodies may reach the dialog.
    super(code);
    this.name = "ResultSignatureError";
    this.messageId = messageId;
  }
}

const positiveId = (value: unknown): number => {
  const id =
    typeof value === "string" && /^[1-9]\d*$/.test(value)
      ? Number(value)
      : value;
  if (typeof id !== "number" || !Number.isSafeInteger(id) || id <= 0) {
    throw new ResultSignatureError("INVALID_SIGNATURE_REQUEST");
  }
  return id;
};
const object = (value: unknown): value is Fields =>
  value !== null && typeof value === "object" && !Array.isArray(value);
const text = (value: unknown, max: number): value is string =>
  typeof value === "string" && value.length > 0 && value.length <= max;
const exactKeys = (value: Fields, allowed: string[]) =>
  Object.keys(value).every((key) => allowed.includes(key));
const invalidResponse = () =>
  new ResultSignatureError("INVALID_SIGNATURE_RESPONSE");
const numericId = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value > 0;

/** One current result-signing ceremony; not a result-content signature or a retry API. */
export const createResultSignatureApi = (options: Options) => {
  const { username, csrf, guard, onUnknown } = options;
  const userId = positiveId(options.userId);
  const recordId = positiveId(options.recordId);
  if (
    !text(username, 255) ||
    username.trim() !== username ||
    !text(csrf, 4096) ||
    /[\r\n]/.test(csrf) ||
    typeof guard !== "function"
  ) {
    throw new ResultSignatureError("INVALID_SIGNATURE_REQUEST");
  }
  let invalid = false;
  let unknownNotified = false;
  let signed = false;
  let certified = false;
  let active: {
    controller: AbortController;
    cancel: () => void;
    write?: Operation;
  } | null = null;

  const unknown = (operation: Operation) => {
    invalid = true;
    if (!unknownNotified) {
      unknownNotified = true;
      try {
        onUnknown?.({ operation });
      } catch {
        /* Keep the fail-closed latch. */
      }
    }
  };
  const dispose = () => {
    invalid = true;
    if (active?.write) unknown(active.write);
    active?.controller.abort();
    active?.cancel();
  };
  const assertCurrent = () => {
    let current = false;
    if (!invalid) {
      try {
        current = guard() === true;
      } catch {
        /* Invalid capability. */
      }
    }
    if (!current) {
      dispose();
      throw new ResultSignatureError("SIGNATURE_CONTEXT_CHANGED");
    }
  };

  const request = async <T>(
    endpoint: string,
    validate: (body: Fields) => T,
    write?: Operation,
    payload?: Fields,
  ): Promise<T> => {
    assertCurrent();
    if (active) throw new ResultSignatureError("SIGNATURE_BUSY");
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let finished = false;
    let dispatched = false;
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    const cancelBody = () => {
      try {
        void reader?.cancel().catch(() => {});
      } catch {
        /* Already released. */
      }
    };
    controller.signal.addEventListener("abort", cancelBody);
    const operation = { controller, write, cancel: () => {} };
    const stopped = new Promise<never>((_, reject) => {
      operation.cancel = () =>
        reject(new ResultSignatureError("SIGNATURE_CONTEXT_CHANGED"));
      timer = setTimeout(() => {
        controller.abort();
        reject(new ResultSignatureError("SIGNATURE_TIMEOUT"));
      }, 30000);
    });
    active = operation;
    try {
      const work = async () => {
        assertCurrent();
        dispatched = true;
        const response = await (write
          ? fetch(config.serverBaseUrl + endpoint, {
              method: "POST",
              credentials: "include",
              cache: "no-store",
              redirect: "manual",
              signal: controller.signal,
              headers: {
                Accept: "application/json",
                "Content-Type": "application/json",
                "Accept-Language": getRequestLocale(),
                "X-CSRF-Token": csrf,
              },
              body: JSON.stringify(payload),
            })
          : readOpenElisResponse(endpoint, controller.signal));
        if (finished || controller.signal.aborted)
          throw new ResultSignatureError("SIGNATURE_TIMEOUT");
        assertCurrent();
        if (
          response.redirected ||
          response.type === "opaqueredirect" ||
          ![200, 201].includes(response.status) ||
          !/^application\/json(?:\s*;|$)/i.test(
            response.headers.get("content-type") || "",
          )
        ) {
          throw invalidResponse();
        }
        const contentLength = response.headers.get("content-length");
        if (
          contentLength !== null &&
          (!/^\d+$/.test(contentLength) || Number(contentLength) > 65536)
        )
          throw invalidResponse();
        if (!response.body || typeof response.body.getReader !== "function")
          throw invalidResponse();
        reader = response.body.getReader();
        const decoder = new TextDecoder("utf-8", { fatal: true });
        let bytes = 0;
        let json = "";
        while (true) {
          assertCurrent();
          const chunk = await reader.read();
          if (finished || controller.signal.aborted)
            throw new ResultSignatureError("SIGNATURE_TIMEOUT");
          assertCurrent();
          if (chunk.done) break;
          if (
            !ArrayBuffer.isView(chunk.value) ||
            Object.prototype.toString.call(chunk.value) !==
              "[object Uint8Array]"
          )
            throw invalidResponse();
          bytes += chunk.value.byteLength;
          if (bytes > 65536) throw invalidResponse();
          json += decoder.decode(chunk.value, { stream: true });
        }
        json += decoder.decode();
        const body: unknown = JSON.parse(json);
        if (finished || controller.signal.aborted)
          throw new ResultSignatureError("SIGNATURE_TIMEOUT");
        assertCurrent();
        if (
          !object(body) ||
          body.success === false ||
          body.error ||
          (typeof body.status === "number" && body.status >= 400) ||
          (typeof body.statusCode === "number" && body.statusCode >= 400)
        )
          throw invalidResponse();
        return validate(body);
      };
      const value = await Promise.race([work(), stopped]);
      assertCurrent();
      return value;
    } catch (error) {
      if (write && dispatched) {
        unknown(write);
        throw new ResultSignatureError("SIGNATURE_OUTCOME_UNKNOWN");
      }
      if (error instanceof ResultSignatureError) throw error;
      throw new ResultSignatureError(
        "SIGNATURE_READ_FAILED",
        "esig.error.loadingStatus",
      );
    } finally {
      finished = true;
      clearTimeout(timer);
      cancelBody();
      controller.signal.removeEventListener("abort", cancelBody);
      try {
        reader?.releaseLock();
      } catch {
        /* Pending canceled read; no reuse. */
      }
      if (active === operation) active = null;
    }
  };
  const requireUsername = (value: unknown) => {
    assertCurrent();
    if (value !== username)
      throw new ResultSignatureError("INVALID_SIGNATURE_REQUEST");
  };

  return Object.freeze({
    username,
    assertCurrent,
    dispose,
    isInvalid: () => invalid,
    isEsigEnabled: () =>
      request("/rest/esig/enabled", (body) => {
        if (typeof body.enabled !== "boolean") throw invalidResponse();
        return { enabled: body.enabled };
      }),
    isUserCertified: async (value: string) => {
      requireUsername(value);
      return request(
        `/rest/esig/certified/${encodeURIComponent(username)}`,
        (body) => {
          if (body.username !== username || typeof body.certified !== "boolean")
            throw invalidResponse();
          return { username, certified: body.certified };
        },
      );
    },
    getSessionStatus: async (value: string) => {
      requireUsername(value);
      return request(
        `/rest/esig/session-status/${encodeURIComponent(username)}`,
        (body) => {
          if (
            body.username !== username ||
            typeof body.sessionActive !== "boolean" ||
            typeof body.signingCount !== "number" ||
            !Number.isSafeInteger(body.signingCount) ||
            body.signingCount < 0
          )
            throw invalidResponse();
          return {
            username,
            sessionActive: body.sessionActive,
            signingCount: body.signingCount,
          };
        },
      );
    },
    executeSignature: async (value: Fields) => {
      assertCurrent();
      if (
        signed ||
        !object(value) ||
        !exactKeys(value, [
          "username",
          "password",
          "recordId",
          "recordType",
          "signatureMeaning",
          "rejectionReason",
        ]) ||
        value.username !== username ||
        positiveId(value.recordId) !== recordId ||
        value.recordType !== "RESULT" ||
        value.signatureMeaning !== "AUTHORED" ||
        !text(value.password, 4096) ||
        (value.rejectionReason !== null && value.rejectionReason !== undefined)
      ) {
        throw new ResultSignatureError("INVALID_SIGNATURE_REQUEST");
      }
      const result = await request(
        "/rest/esig/sign",
        (body) => {
          if (
            !numericId(body.signatureId) ||
            body.signerId !== userId ||
            body.recordId !== recordId ||
            body.recordType !== "RESULT" ||
            body.signatureMeaning !== "AUTHORED"
          )
            throw invalidResponse();
          return {
            signatureId: body.signatureId,
            signerId: userId,
            recordId,
            recordType: "RESULT" as const,
            signatureMeaning: "AUTHORED" as const,
          };
        },
        "sign",
        {
          username,
          password: value.password,
          recordId,
          recordType: "RESULT",
          signatureMeaning: "AUTHORED",
          rejectionReason: null,
        },
      );
      signed = true;
      return result;
    },
    certifyUser: async (value: Fields) => {
      assertCurrent();
      if (
        certified ||
        !object(value) ||
        !exactKeys(value, ["username", "password", "certificationText"]) ||
        value.username !== username ||
        !text(value.password, 4096) ||
        !text(value.certificationText, 16000)
      ) {
        throw new ResultSignatureError("INVALID_SIGNATURE_REQUEST");
      }
      const result = await request(
        "/rest/esig/certify",
        (body) => {
          if (!numericId(body.certificationId) || body.userId !== userId)
            throw invalidResponse();
          return {
            certificationId: body.certificationId,
            userId,
          };
        },
        "certify",
        {
          username,
          password: value.password,
          certificationText: value.certificationText,
        },
      );
      certified = true;
      return result;
    },
  });
};

export type ResultSignatureApi = ReturnType<typeof createResultSignatureApi>;
