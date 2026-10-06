const clean = (value) => (typeof value === "string" ? value.trim() : "");

export const formatPatientDisplayName = (patient, locale = "en") => {
  const first = clean(patient?.firstName);
  const last = clean(patient?.lastName);
  const present = [last, first].filter(Boolean);
  if (present.length < 2) return present.join("");
  if (present.every((part) => /^[\p{Script=Han}·]+$/u.test(part)))
    return last + first;
  return /^zh(?:[-_]|$)/i.test(locale)
    ? `${last} ${first}`
    : `${first} ${last}`;
};
