import { readFileSync } from "node:fs";

test("legacy result fallback does not expose English navigation or status text", () => {
  const source = readFileSync(
    `${process.cwd()}/src/components/resultPage/SearchResultForm.jsx`,
    "utf8",
  );

  expect(source).not.toContain('iconDescription="previous"');
  expect(source).not.toContain('iconDescription="next"');
  expect(source).not.toContain('alt="nonconforming"');
});
