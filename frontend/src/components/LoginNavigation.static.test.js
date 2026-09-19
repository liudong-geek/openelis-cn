import { readFileSync } from "node:fs";

test("successful form login stays on the configured browser origin", () => {
  const source = readFileSync(
    `${process.cwd()}/src/components/Login.jsx`,
    "utf8",
  );

  expect(source).toContain(
    'navigateToInternalPath("/Dashboard", { replace: true })',
  );
  expect(source).not.toContain('window.location.href = "/"');
});
