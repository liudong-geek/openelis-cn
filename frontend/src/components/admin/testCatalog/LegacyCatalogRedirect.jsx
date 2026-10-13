import React from "react";
import { Redirect, useLocation } from "react-router-dom";
import { getCatalogReturnTo } from "./catalogReturnTo";

/** Old bookmarks open the same list and modal as current navigation. */
export default function LegacyCatalogRedirect({ create = false }) {
  const location = useLocation();
  const base = location.pathname.startsWith("/admin/")
    ? "/admin"
    : "/MasterListsPage";
  const source = new URLSearchParams(location.search);
  const hasReturn = source.has("returnTo") || location.state?.returnTo;
  const returnSearch = source.has("returnTo")
    ? location.search
    : `?returnTo=${encodeURIComponent(location.state?.returnTo || "")}`;
  const target = hasReturn
    ? getCatalogReturnTo(returnSearch, base)
    : `${base}/TestCatalogList${location.search}`;
  const [pathname, query = ""] = target.split("?");
  const params = new URLSearchParams(query);
  params.delete("returnTo");
  if (create) params.set("create", "true");
  return (
    <Redirect
      to={{ pathname, search: params.toString(), state: location.state }}
    />
  );
}
