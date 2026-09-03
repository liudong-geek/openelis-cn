import React from "react";
import { Redirect, useLocation } from "react-router-dom";

// Compatibility only: history is an action on the patient list, not a second
// patient search workflow. Preserve bookmarks that already identify a patient.
export default function PatientHistory() {
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const patientId = params.get("patientId") || params.get("patientID");
  return (
    <Redirect
      to={{
        pathname: patientId
          ? `/PatientResults/${encodeURIComponent(patientId)}`
          : "/PatientManagement",
        state: location.state,
      }}
    />
  );
}
