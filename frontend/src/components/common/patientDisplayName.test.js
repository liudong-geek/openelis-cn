import { formatPatientDisplayName } from "./patientDisplayName";
test.each([
  ["zh", { firstName: "洋", lastName: "刘" }, "刘洋"],
  ["en", { firstName: "洋", lastName: "刘" }, "刘洋"],
  ["zh_CN", { firstName: "Henry", lastName: "Wang" }, "Wang Henry"],
  ["en", { firstName: "Henry", lastName: "Wang" }, "Henry Wang"],
  ["zh", { firstName: null, lastName: "刘" }, "刘"],
  ["zh", null, ""],
])(
  "formats authorized names for %s (%j) as %s without changing source fields",
  (locale, value, result) => {
    const patient = value && Object.freeze({ ...value });
    expect(formatPatientDisplayName(patient, locale)).toBe(result);
    if (patient) expect(patient).toEqual(value);
  },
);
