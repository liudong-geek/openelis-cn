import { defineConfig } from "vitest/config";
import base from "./vite.config";

const baseTest = base.test ?? {};
const baseAliases = baseTest.alias;
const alias = Array.isArray(baseAliases)
  ? baseAliases.filter((entry) => entry.find !== "flatpickr")
  : baseAliases &&
    Object.fromEntries(
      Object.entries(baseAliases).filter(([name]) => name !== "flatpickr"),
    );
const exclusions = Array.isArray(baseTest.exclude) ? baseTest.exclude : [];

// The normal unit setup isolates Flatpickr; this one file explicitly unmocks
// it and checks the real Carbon/vendor calendar instead.
export default defineConfig({
  ...base,
  test: {
    ...baseTest,
    alias,
    include: ["src/components/nonconform/common/NceCalendar.locale.test.jsx"],
    exclude: exclusions.filter(
      (pattern) => pattern !== "**/NceCalendar.locale.test.jsx",
    ),
  },
});
