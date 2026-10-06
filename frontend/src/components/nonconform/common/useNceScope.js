import { useContext, useEffect, useRef, useState } from "react";
import UserSessionDetailsContext from "../../../UserSessionDetailsContext";
import { NceRequestError, nceSessionKey } from "./nceWorkspaceRequest";

export const useNceScope = () => {
  const session = useContext(UserSessionDetailsContext);
  const [, rerender] = useState(0);
  let owner = null;
  try {
    if (!session.errorLoadingSessionDetails && !session.isCheckingLogin?.())
      owner = nceSessionKey(session.userSessionDetails);
  } catch {
    /* No verified actor: clear visible content immediately. */
  }
  const current = useRef({
    owner,
    epoch: 0,
    mounted: true,
    requests: new Set(),
  });
  const invalidate = () => {
    current.current.epoch += 1;
    for (const c of current.current.requests) c.abort();
    current.current.requests.clear();
  };
  if (current.current.owner !== owner) {
    invalidate();
    current.current.owner = owner;
  }
  useEffect(() => {
    current.current.mounted = true;
    const changed = () => {
      invalidate();
      rerender((n) => n + 1);
    };
    window.addEventListener("storage", changed);
    return () => {
      current.current.mounted = false;
      invalidate();
      window.removeEventListener("storage", changed);
    };
  }, []);
  const epoch = current.current.epoch;
  const isCurrent = (atOwner, atEpoch) =>
    current.current.mounted &&
    current.current.owner === atOwner &&
    current.current.epoch === atEpoch &&
    !!atOwner;
  const run = async (work, write = false) => {
    const atOwner = current.current.owner,
      atEpoch = current.current.epoch;
    if (!atOwner) throw new NceRequestError("unauthenticated");
    const controller = new AbortController();
    current.current.requests.add(controller);
    let timer, abortHandler;
    try {
      const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => {
          reject(
            new NceRequestError("timeout", write ? "UNKNOWN" : "NOT_APPLIED"),
          );
          controller.abort();
        }, 20000);
      });
      const aborted = new Promise((_, reject) => {
        abortHandler = () =>
          reject(
            new NceRequestError("scope", write ? "UNKNOWN" : "NOT_APPLIED"),
          );
        controller.signal.addEventListener("abort", abortHandler, {
          once: true,
        });
      });
      const result = await Promise.race([
        work(controller.signal, atOwner),
        timeout,
        aborted,
      ]);
      if (!isCurrent(atOwner, atEpoch))
        throw new NceRequestError("scope", write ? "UNKNOWN" : "NOT_APPLIED");
      return result;
    } finally {
      clearTimeout(timer);
      if (abortHandler)
        controller.signal.removeEventListener("abort", abortHandler);
      current.current.requests.delete(controller);
    }
  };
  return { owner, epoch, isCurrent, run };
};
