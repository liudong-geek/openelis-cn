import { readFileSync } from "node:fs";
import en from "../../languages/en.json";
import zh from "../../languages/zh.json";
import zhCN from "../../languages/zh_CN.json";

const expectedTerms = {
  "address.search.clear": "清除地址搜索",
  "address.search.results": "地址搜索结果",
  "patient.photo.label": "患者照片",
};

describe.each([
  ["zh", zh],
  ["zh-CN", zhCN],
])("China patient accessibility text for %s", (_locale, messages) => {
  test.each(Object.entries(expectedTerms))("%s", (id, expected) => {
    expect(messages[id]).toBe(expected);
  });
});

test.each(Object.keys(expectedTerms))(
  "English compatibility resource defines %s",
  (id) => {
    expect(en[id]).toEqual(expect.any(String));
    expect(en[id].trim()).not.toBe("");
  },
);

test.each([
  ["AddressSearch.tsx", 'aria-label="Clear search"'],
  ["AddressSearch.tsx", 'aria-label="Address search results"'],
  [
    "photoManagement/uploadPhoto/PatientImageSelector.tsx",
    'alt="Patient photo"',
  ],
  ["photoManagement/photoAvatar/AyncAvatar.tsx", 'alt="Patient avatar"'],
  ["../layout/search/searchOutput.tsx", 'alt="Patient avatar"'],
  ["../common/cascadingMultiSelect.jsx", 'iconDescription="Remove"'],
])("%s does not expose %s", (file, hardcodedText) => {
  const source = readFileSync(
    `${process.cwd()}/src/components/patient/${file}`,
    "utf8",
  );
  expect(source).not.toContain(hardcodedText);
});
