import { useLayoutEffect, useRef, useState } from "react";
import config from "../../../config.json";

const HEARTBEAT_MS = 10_000;
const TIMEOUT_MS = 8_000;
const MAX_BYTES = 65_536;
const MAX_IDS = 1_000;
const positiveId = (value: unknown): value is string =>
  typeof value === "string" && /^[1-9][0-9]{0,9}$/.test(value);
const authorized = (isCurrent: () => boolean): boolean => {
  try {
    return isCurrent() === true;
  } catch {
    return false;
  }
};
const EMPTY: Record<string, string> = Object.freeze({});
interface PresenceState {
  key: string;
  presence: Record<string, string>;
  unavailable: boolean;
}
interface Flight {
  abort: AbortController;
  retired: boolean;
  cancelBody?: () => void;
}

async function readPresence(
  response: Response,
  visible: Set<string>,
  flight: Flight,
): Promise<Record<string, string>> {
  const length = response.headers.get("content-length");
  if (
    response.redirected ||
    response.type === "opaqueredirect" ||
    !/^application\/json(?:\s*;\s*charset\s*=\s*(?:utf-8|"utf-8"))?\s*$/i.test(
      response.headers.get("content-type") || "",
    ) ||
    (length !== null &&
      (!/^\d+$/.test(length) || Number(length) > MAX_BYTES)) ||
    !response.body
  ) {
    void response.body?.cancel().catch(() => {});
    throw new Error("Invalid presence response");
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8", { fatal: true });
  flight.cancelBody = () => {
    void reader.cancel().catch(() => {});
  };
  let bytes = 0;
  let text = "";
  try {
    for (;;) {
      const chunk = await reader.read();
      if (flight.retired || flight.abort.signal.aborted)
        throw new Error("Retired presence request");
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > MAX_BYTES) throw new Error("Presence response too large");
      text += decoder.decode(chunk.value, { stream: true });
    }
    text += decoder.decode();
    const value: unknown = JSON.parse(text);
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw new Error("Invalid presence map");
    const presence: Record<string, string> = {};
    for (const [id, name] of Object.entries(value)) {
      if (
        !positiveId(id) ||
        !visible.has(id) ||
        typeof name !== "string" ||
        !name.trim() ||
        name.length > 256 ||
        /[\u0000-\u001f\u007f]/.test(name)
      )
        throw new Error("Invalid presence member");
      presence[id] = name;
    }
    return presence;
  } finally {
    flight.cancelBody();
    flight.cancelBody = undefined;
    reader.releaseLock();
  }
}

/** Advisory only. Never grants clinical access or retries an unknown clinical write. */
export function useResultPresence(
  editingAnalysisId: string | null,
  visibleAnalysisIds: string[],
  bindingKey: string,
  isCurrent: () => boolean,
  csrf: string,
): { presence: Record<string, string>; unavailable: boolean } {
  const visible = [...new Set(visibleAnalysisIds.filter(positiveId))].sort();
  const analysisId =
    positiveId(editingAnalysisId) && visible.includes(editingAnalysisId)
      ? editingAnalysisId
      : null;
  const credentialKey = JSON.stringify([bindingKey, csrf]);
  const [deniedKey, setDeniedKey] = useState<string | null>(null);
  const deniedCredential = useRef<string | null>(null);
  const permitted = Boolean(
    bindingKey.trim() &&
    csrf.trim() &&
    visible.length <= MAX_IDS &&
    deniedKey !== credentialKey &&
    authorized(isCurrent),
  );
  const key = JSON.stringify([credentialKey, visible, analysisId, permitted]);
  const latest = useRef({ key, credentialKey, isCurrent, permitted });
  latest.current = { key, credentialKey, isCurrent, permitted };
  const mounted = useRef(false);
  const inFlight = useRef<Flight | null>(null);
  const [state, setState] = useState<PresenceState>({
    key: "",
    presence: EMPTY,
    unavailable: true,
  });

  useLayoutEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useLayoutEffect(() => {
    let active = true;
    let ownedFlight: Flight | null = null;
    let deadline: ReturnType<typeof setTimeout> | undefined;
    const current = () =>
      active &&
      latest.current.key === key &&
      latest.current.permitted &&
      deniedCredential.current !== credentialKey &&
      authorized(latest.current.isCurrent);
    const unavailable = () => {
      if (active && latest.current.key === key)
        setState({ key, presence: EMPTY, unavailable: true });
    };
    const retire = (flight: Flight) => {
      flight.retired = true;
      flight.abort.abort();
      flight.cancelBody?.();
    };
    const beat = () => {
      if (!current()) {
        if (ownedFlight) retire(ownedFlight);
        unavailable();
        return;
      }
      // Keep the transport slot until it actually settles, even if fetch ignores abort.
      // The user-visible request still expires at the deadline; no new requests pile up.
      if (inFlight.current) return;
      const flight: Flight = { abort: new AbortController(), retired: false };
      inFlight.current = flight;
      ownedFlight = flight;
      deadline = setTimeout(() => {
        retire(flight);
        unavailable();
      }, TIMEOUT_MS);
      void (async () => {
        const response = await fetch(
          config.serverBaseUrl + "/rest/results-entry/presence",
          {
            method: "POST",
            credentials: "include",
            redirect: "manual",
            cache: "no-store",
            signal: flight.abort.signal,
            headers: {
              "Content-Type": "application/json; charset=UTF-8",
              Accept: "application/json",
              "X-CSRF-Token": csrf,
            },
            body: JSON.stringify({ analysisId, visibleAnalysisIds: visible }),
          },
        );
        // A retired worklist response cannot supply names, but its credential
        // rejection still applies to the same mounted authentication binding.
        // Do this before the worklist/timeout guard, never for a new binding.
        if (
          (response.status === 401 || response.status === 403) &&
          mounted.current &&
          latest.current.credentialKey === credentialKey
        ) {
          deniedCredential.current = credentialKey;
          setDeniedKey(credentialKey);
        }
        if (flight.retired || !current()) {
          void response.body?.cancel().catch(() => {});
          unavailable();
          return;
        }
        if (response.status !== 200) {
          void response.body?.cancel().catch(() => {});
          throw new Error("Presence unavailable");
        }
        const presence = await readPresence(response, new Set(visible), flight);
        if (!flight.retired && current())
          setState({ key, presence, unavailable: false });
        else unavailable();
      })()
        .catch(unavailable)
        .finally(() => {
          clearTimeout(deadline);
          if (inFlight.current === flight) inFlight.current = null;
          if (ownedFlight === flight) ownedFlight = null;
        });
    };
    beat();
    const interval = setInterval(beat, HEARTBEAT_MS);
    return () => {
      active = false;
      clearInterval(interval);
      clearTimeout(deadline);
      if (ownedFlight) retire(ownedFlight);
    };
    // The canonical key binds credentials, visible membership, editor, and authority.
    // Callback identity can change on every render without restarting the heartbeat.
  }, [key]);

  return permitted && state.key === key
    ? { presence: state.presence, unavailable: state.unavailable }
    : { presence: EMPTY, unavailable: true };
}
