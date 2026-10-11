import { defineConfig } from "vitest/config";
import base from "./vite.config";

const baseTest = base.test ?? {};
const aliases = baseTest.alias;
const alias = Array.isArray(aliases)
  ? aliases.filter((entry) => entry.find !== "flatpickr")
  : aliases &&
    Object.fromEntries(
      Object.entries(aliases).filter(([name]) => name !== "flatpickr"),
    );

// Exercise the real vendor calendar and Formik input lifecycle. The ordinary
// unit suite keeps its existing isolated calendar configuration.
export default defineConfig({
  ...base,
  test: {
    ...baseTest,
    alias,
    include: ["src/components/common/CustomDatePicker.test.jsx"],
  },
});
