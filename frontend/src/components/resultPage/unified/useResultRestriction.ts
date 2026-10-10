import {
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import UserSessionDetailsContext from "../../../UserSessionDetailsContext";
import { resultReadSessionKey } from "./resultReadSession";
import { RestrictionIdentity } from "./resultRestrictionHandoff";
import {
  readResultRestriction,
  ResultRestriction,
  RestrictionFailure,
  restrictionFailure,
} from "./resultRestrictionRequest";
export function useResultRestriction(scopeToken: string, enabled = true) {
  const session = useContext(UserSessionDetailsContext),
    owner = resultReadSessionKey(session);
  const scope = JSON.stringify([owner, scopeToken, enabled]);
  const current = useRef({
    scope,
    owner,
    epoch: 0,
    scopeEpoch: 0,
    alive: true,
  });
  const request = useRef<AbortController | null>(null);
  if (current.current.scope !== scope) {
    current.current = {
      scope,
      owner,
      epoch: current.current.epoch + 1,
      scopeEpoch: current.current.scopeEpoch + 1,
      alive: true,
    };
    request.current?.abort();
  }
  const [state, setState] = useState<{
    scope: string;
    epoch: number;
    phase: "idle" | "loading" | "success" | "error";
    data?: ResultRestriction;
    error?: RestrictionFailure;
  } | null>(null);
  const invalidate = () => {
    current.current.scopeEpoch++;
    current.current.epoch++;
    request.current?.abort();
    request.current = null;
    setState(null);
  };
  useLayoutEffect(() => {
    setState(null);
  }, [scope]);
  useEffect(() => {
    current.current.alive = true;
    const storage = (event: StorageEvent) => {
      if (event.key === null || event.key === "CSRF") invalidate();
    };
    window.addEventListener("storage", storage);
    return () => {
      current.current.alive = false;
      current.current.epoch++;
      request.current?.abort();
      window.removeEventListener("storage", storage);
    };
  }, []);
  const isCurrent = (expected = current.current) =>
    current.current.alive &&
    current.current.scope === expected.scope &&
    current.current.epoch === expected.epoch &&
    current.current.owner === expected.owner &&
    !!expected.owner &&
    enabled;
  const read = async (identity: RestrictionIdentity) => {
    if (!enabled || !current.current.owner) return null;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    const expected = { ...current.current, epoch: ++current.current.epoch };
    setState({
      scope: expected.scope,
      epoch: expected.epoch,
      phase: "loading",
    });
    try {
      const data = await readResultRestriction(
        identity,
        controller.signal,
        expected.owner!,
      );
      if (!isCurrent(expected) || controller.signal.aborted) return null;
      setState({
        scope: expected.scope,
        epoch: expected.epoch,
        phase: "success",
        data,
      });
      return data;
    } catch (error) {
      if (isCurrent(expected) && !controller.signal.aborted)
        setState({
          scope: expected.scope,
          epoch: expected.epoch,
          phase: "error",
          error: restrictionFailure(error),
        });
      return null;
    } finally {
      if (request.current === controller) request.current = null;
    }
  };
  const visible =
    state &&
    state.scope === scope &&
    state.epoch === current.current.epoch &&
    owner &&
    enabled
      ? state
      : null;
  return {
    scopeStamp: JSON.stringify([scope, current.current.scopeEpoch]),
    data: visible?.data,
    phase: visible?.phase || "idle",
    error: visible?.error,
    read,
    invalidate,
    isCurrent,
    owner,
  };
}
