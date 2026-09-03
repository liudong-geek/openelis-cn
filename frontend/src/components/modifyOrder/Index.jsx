import React from "react";
import { Redirect, useLocation } from "react-router-dom";

// Old record bookmarks still open the editor; the redundant search gate is
// replaced by the application list. Record query parameters remain intact.
export default function FindOrder() {
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const hasRecord = params.get("accessionNumber") || params.get("patientId");
  return (
    <Redirect
      to={{
        pathname: hasRecord ? "/ModifyOrder" : "/order",
        search: hasRecord ? location.search : "",
        state: location.state,
      }}
    />
  );
}
