import { render } from "@testing-library/react";
import App, { AUDIT_TRAIL_ROUTE_ROLES } from "./App";
import { Roles } from "./components/utils/Utils";

test("renders App component without errors", () => {
  // Just verify the App component renders without throwing errors
  const { container } = render(<App />);
  expect(container).toBeTruthy();
});

describe("China delivery route role contracts", () => {
  test("uses the backend Lab Supervisor role name for QC routes", () => {
    expect(Roles.LAB_SUPERVISOR).toBe("Lab Supervisor");
  });

  test("allows only audit administrators and the Audit Trail role into audit logs", () => {
    expect(AUDIT_TRAIL_ROUTE_ROLES).toEqual([
      Roles.GLOBAL_ADMIN,
      Roles.AUDIT_TRAIL,
    ]);
    expect(AUDIT_TRAIL_ROUTE_ROLES).not.toContain(Roles.REPORTS);
  });
});
