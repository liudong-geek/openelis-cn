import type { PatientRecord } from "./types";

export const formatPatientMaintenanceName = (patient: PatientRecord) => {
  const first = String(patient.firstName || "").trim();
  const last = String(patient.lastName || "").trim();
  return /[\u3400-\u9fff]/u.test(last + first)
    ? last + first || "—"
    : `${first} ${last}`.trim() || "—";
};

export const confirmedPatientSaveId = (
  response: Record<string, unknown> | undefined,
  expectedId?: string,
): string | null => {
  if (
    !response ||
    response.status !== "success" ||
    response.error ||
    Number(response.statusCode || 0) >= 400
  )
    return null;
  const id = String(response.patientId || "").trim();
  return id && (!expectedId || id === expectedId) ? id : null;
};

const persistedFields = [
  "nationalId",
  "subjectNumber",
  "lastName",
  "firstName",
  "aka",
  "streetAddress",
  "city",
  "primaryPhone",
  "email",
  "gender",
  "birthDateForDisplay",
  "commune",
  "education",
  "maritialStatus",
  "nationality",
  "healthDistrict",
  "healthRegion",
  "otherNationality",
  "occupation",
  "customNotes",
  "targetDiseaseProgramme",
  "gpsLatitude",
  "gpsLongitude",
  "addressDepartment",
  "mothersName",
  "mothersInitial",
  "patientType",
  "insuranceNumber",
  "STnumber",
];
export const patientMediaMatches = (saved: string, draft: string) => {
  const content = (value: string) =>
    value.startsWith("data:") ? value.slice(value.indexOf(",") + 1) : value;
  return content(saved) === content(draft);
};
const text = (value: unknown) => String(value ?? "");

// GPS is stored as decimal data. Compare its exact coefficient and exponent,
// without floating-point rounding or expanding exponent-sized strings.
const decimalCoordinate = (value: unknown): string | null => {
  const input = text(value).trim();
  if (!input) return "";
  const match =
    /^([+-]?)(?:(\d+)(?:\.(\d*))?|\.(\d+))(?:[eE]([+-]?\d+))?$/.exec(input);
  if (!match) return null;
  const [
    ,
    sign,
    integer = "",
    regularFraction,
    leadingFraction,
    exponent = "0",
  ] = match;
  const fraction = regularFraction ?? leadingFraction ?? "";
  const coefficient = (integer + fraction).replace(/^0+/, "");
  if (!coefficient) return "0";
  const significant = coefficient.replace(/0+$/, "");
  const power =
    BigInt(exponent) -
    BigInt(fraction.length) +
    BigInt(coefficient.length - significant.length);
  return `${sign === "-" ? "-" : ""}${significant}e${power}`;
};

/** Compare the editable fields exposed by the existing full-details contract. */
export const patientMaintenanceMatches = (
  saved: PatientRecord | undefined,
  draft: PatientRecord,
  id: string,
): boolean => {
  if (!saved || String(saved.patientPK || "") !== id || saved.error)
    return false;
  if (
    persistedFields.some((field) => {
      if (field === "gpsLatitude" || field === "gpsLongitude") {
        const coordinate = decimalCoordinate(saved[field]);
        return (
          coordinate === null || coordinate !== decimalCoordinate(draft[field])
        );
      }
      return text(saved[field]) !== text(draft[field]);
    })
  )
    return false;
  for (let index = 0; index < 10; index++) {
    const key = `addressHierarchy_${index}`;
    if (
      text(saved.addressHierarchy?.[key]) !==
      text(draft[key] ?? draft.addressHierarchy?.[key])
    )
      return false;
  }
  if (
    draft.patientContact?.id &&
    String(saved.patientContact?.id || "") !== String(draft.patientContact.id)
  )
    return false;
  if (
    draft.patientContact?.person?.id &&
    String(saved.patientContact?.person?.id || "") !==
      String(draft.patientContact.person.id)
  )
    return false;
  return (["firstName", "lastName", "primaryPhone", "email"] as const).every(
    (field) =>
      text(saved.patientContact?.person?.[field]) ===
      text(draft.patientContact?.person?.[field]),
  );
};
