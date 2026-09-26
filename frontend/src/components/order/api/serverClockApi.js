import { getFromOpenElisServer } from "../../utils/Utils";
import { normalizeServerClock } from "../steps/collectionClock";

export const getVerifiedServerClock = () =>
  new Promise((resolve) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      controller.abort();
      resolve(null);
    }, 10_000);
    getFromOpenElisServer(
      "/rest/server-time",
      (response) => {
        clearTimeout(timeout);
        resolve(normalizeServerClock(response));
      },
      controller.signal,
    );
  });
