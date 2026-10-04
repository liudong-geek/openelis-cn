const LIST_PATHS = new Set([
  "/MasterListsPage/TestCatalogList",
  "/admin/TestCatalogList",
]);

const defaultList = (base) =>
  `${base === "/admin" ? "/admin" : "/MasterListsPage"}/TestCatalogList`;

// Match the literal path, without URL normalization: dot segments, encoded
// paths, foreign origins and protocol-relative addresses are never accepted.
const validReturnTo = (value) => {
  if (typeof value !== "string" || /[\\#\u0000-\u0020\u007f]/.test(value)) {
    return false;
  }
  return LIST_PATHS.has(value.split("?", 1)[0]);
};

/** Preserve the list's own query bytes (including encoded search terms). */
export const buildCatalogReturnTo = ({ pathname, search = "", hash = "" }) => {
  const fallback = defaultList(pathname?.startsWith("/admin/") ? "/admin" : "");
  if (hash || (search && !search.startsWith("?"))) return fallback;
  const value = `${pathname}${search}`;
  return validReturnTo(value) ? value : fallback;
};

export const getCatalogReturnTo = (search, base = "/MasterListsPage") => {
  const values = new URLSearchParams(search || "").getAll("returnTo");
  return values.length === 1 && validReturnTo(values[0])
    ? values[0]
    : defaultList(base);
};

/** editorPath is an application-owned editor route, never a query input. */
export const withCatalogReturnTo = (editorPath, returnTo) => {
  const base = editorPath.startsWith("/admin/") ? "/admin" : "/MasterListsPage";
  const safeReturnTo = validReturnTo(returnTo) ? returnTo : defaultList(base);
  // Preserve old deep links when there is no list context to carry.
  if (safeReturnTo === defaultList(base)) return editorPath;
  const separator = editorPath.includes("?") ? "&" : "?";
  return `${editorPath}${separator}returnTo=${encodeURIComponent(safeReturnTo)}`;
};
