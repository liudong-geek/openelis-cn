import {
  patientMaintenancePendingKey,
  readPatientMaintenancePending,
  beginPatientMaintenancePending,
  clearPatientMaintenancePending,
} from "./patientMaintenancePending";

beforeEach(() => {
  vi.restoreAllMocks();
  window.sessionStorage.clear();
});
test("opaque markers are isolated by stable account and patient identities", () => {
  const key = patientMaintenancePendingKey("SIM-A", "42");
  expect(beginPatientMaintenancePending(key)).toBe("started");
  expect(window.sessionStorage.getItem(key)).toBe("pending");
  expect(beginPatientMaintenancePending(key)).toBe("pending");
  expect(
    readPatientMaintenancePending(patientMaintenancePendingKey("SIM-B", "42")),
  ).toBe("clear");
  expect(
    readPatientMaintenancePending(patientMaintenancePendingKey("SIM-A", "43")),
  ).toBe("clear");
  expect(clearPatientMaintenancePending(key)).toBe(true);
  expect(readPatientMaintenancePending(key)).toBe("clear");
});
test("missing account identity and inaccessible storage cannot allow a save", () => {
  expect(
    beginPatientMaintenancePending(patientMaintenancePendingKey("", "42")),
  ).toBe("unavailable");
  vi.spyOn(
    Object.getPrototypeOf(window.sessionStorage),
    "getItem",
  ).mockImplementation(() => {
    throw new Error("Storage unavailable");
  });
  expect(
    beginPatientMaintenancePending(patientMaintenancePendingKey("SIM-A", "42")),
  ).toBe("unavailable");
});
test("silent persistence and removal failures are detected by readback", () => {
  const key = patientMaintenancePendingKey("SIM-A", "42");
  vi.spyOn(
    Object.getPrototypeOf(window.sessionStorage),
    "setItem",
  ).mockImplementation(() => {});
  expect(beginPatientMaintenancePending(key)).toBe("unavailable");
  vi.restoreAllMocks();
  expect(beginPatientMaintenancePending(key)).toBe("started");
  vi.spyOn(
    Object.getPrototypeOf(window.sessionStorage),
    "removeItem",
  ).mockImplementation(() => {});
  expect(clearPatientMaintenancePending(key)).toBe(false);
  expect(readPatientMaintenancePending(key)).toBe("pending");
});
