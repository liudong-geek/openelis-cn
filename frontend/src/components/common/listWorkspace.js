// Only known local list pages may be used as a return destination. Keeping the
// list state in router history avoids storing patient searches in localStorage.
const LIST_PATHS = new Set([
  "/PatientManagement",
  "/order",
  "/SampleManagement",
]);

export const fromList = (pathname, listState) => ({
  listOrigin: { pathname, state: { listState } },
});

export const listReturnLocation = (state, fallback) => {
  const origin = state?.listOrigin;
  return origin && LIST_PATHS.has(origin.pathname)
    ? { pathname: origin.pathname, state: origin.state }
    : { pathname: fallback };
};

export const pushWithListContext = (history, pathname) => {
  const listOrigin = history.location?.state?.listOrigin;
  if (listOrigin) history.push({ pathname, state: { listOrigin } });
  else history.push(pathname);
};
