import { compile } from "sass";
import { parse } from "postcss";
import { resolve } from "node:path";

// This checks the shipped stylesheet contract, not browser geometry. The
// acceptance run must also measure the real Carbon table at desktop widths.
const stylesheet = resolve(process.cwd(), "src/ux-foundation.scss");
const css = parse(compile(stylesheet).css);
const normalizeSelector = (selector) => selector.replace(/\s+/g, " ").trim();
const declarations = (selector, property) => {
  const values = [];
  css.walkRules((rule) => {
    if (
      rule.selectors
        .map(normalizeSelector)
        .includes(normalizeSelector(selector))
    ) {
      rule.walkDecls(property, (declaration) => values.push(declaration.value));
    }
  });
  return values;
};

test("results use fixed clinical column widths instead of content-driven squeezing", () => {
  expect(declarations(".results-workbench__table", "table-layout")).toEqual([
    "fixed",
  ]);
  expect(declarations(".results-workbench__table", "min-width")).toEqual([
    "64rem",
  ]);
  const expected = {
    subject: "24%",
    test: "20%",
    range: "12%",
    result: "22%",
    status: "12%",
    actions: "10%",
  };
  Object.entries(expected).forEach(([column, width]) => {
    expect(
      declarations(`.results-workbench__column--${column}`, "width"),
    ).toEqual([width]);
  });
});

test("narrow workspaces scroll only the bounded table region", () => {
  expect(
    declarations(".results-workbench__table-scroll", "overflow-x"),
  ).toEqual(["auto"]);
  expect(declarations(".results-workbench__table-scroll", "max-width")).toEqual(
    ["100%"],
  );
  expect(declarations(".results-workbench__table-scroll", "min-width")).toEqual(
    ["0"],
  );
});

test("identifiers and names are stacked and long text remains fully available", () => {
  for (const selector of [
    ".results-workbench__accession",
    ".results-workbench__patient-name",
    ".results-workbench__specimen-barcode",
  ]) {
    expect(declarations(selector, "display")).toEqual(["block"]);
    expect(declarations(selector, "overflow-wrap")).toEqual(["anywhere"]);
    expect(declarations(selector, "text-overflow")).not.toContain("ellipsis");
  }
  expect(
    declarations(
      ".results-workbench__table .results-workbench__cell--status",
      "white-space",
    ),
  ).toEqual(["normal"]);
});

test("result inputs and row buttons stay inside their own clinical column", () => {
  const result =
    ".results-workbench__cell--result :where(.cds--select, .cds--select-input, .cds--text-input, .cds--text-area)";
  expect(declarations(result, "width")).toEqual(["100%"]);
  expect(declarations(result, "min-width")).toEqual(["0"]);
  const button = ".results-workbench__cell--actions .cds--btn";
  expect(declarations(button, "min-width")).toEqual(["0"]);
  expect(declarations(button, "max-width")).toEqual(["100%"]);
});
