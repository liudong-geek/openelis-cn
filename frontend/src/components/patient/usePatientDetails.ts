import { useEffect, useState } from "react";
import { getFromOpenElisServer } from "../utils/Utils";
import type { Nullable, PatientRecord } from "./types";

interface PatientDetailsHookResult {
  patient: Nullable<PatientRecord>;
  loading: boolean;
  error: Nullable<Error>;
}

/** Read full identity and photo together; each effect owns its callbacks. */
export default function usePatientDetails(
  patientId?: Nullable<string>,
  reloadVersion = 0,
): PatientDetailsHookResult {
  const [patient, setPatient] = useState<Nullable<PatientRecord>>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Nullable<Error>>(null);
  const [requestContext, setRequestContext] = useState({
    id: patientId,
    version: reloadVersion,
  });
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setRequestContext({ id: patientId, version: reloadVersion });
    setPatient(null);
    setError(null);
    setLoading(!!patientId);
    if (!patientId)
      return () => {
        active = false;
      };
    const fail = () => {
      if (!active) return;
      active = false;
      setLoading(false);
      setError(new Error("Patient details could not be verified"));
    };
    const timeout = setTimeout(() => {
      fail();
      active = false;
      controller.abort();
    }, 30000);
    getFromOpenElisServer<PatientRecord>(
      `/rest/patient-details?patientID=${encodeURIComponent(patientId)}`,
      (details) => {
        if (!active) return;
        if (
          !details ||
          String(details.patientPK || "") !== patientId ||
          details.error
        ) {
          clearTimeout(timeout);
          fail();
          return;
        }
        getFromOpenElisServer<{ data?: string }>(
          `/rest/patient-photos/${encodeURIComponent(patientId)}/false`,
          (photo) => {
            if (!active) return;
            clearTimeout(timeout);
            if (!photo || typeof photo.data !== "string") {
              fail();
              return;
            }
            setPatient({ ...details, photo: photo.data });
            setLoading(false);
          },
          controller.signal,
        );
      },
      controller.signal,
    );
    return () => {
      active = false;
      clearTimeout(timeout);
      controller.abort();
    };
  }, [patientId, reloadVersion]);
  if (
    requestContext.id !== patientId ||
    requestContext.version !== reloadVersion
  )
    return { patient: null, loading: !!patientId, error: null };
  return { patient, loading, error };
}
