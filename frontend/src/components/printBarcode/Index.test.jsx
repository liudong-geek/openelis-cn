import React from "react";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { IntlProvider } from "react-intl";
import messages from "../../languages/zh.json";
import PrintBarcode from "./Index";
vi.mock("./ExistingOrder", () => ({
  default: ({ initialLabNumber }) => <div>当前申请：{initialLabNumber}</div>,
}));
vi.mock("./PrePrint", () => ({ default: () => <div>预印工具</div> }));
const mount = (path) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <IntlProvider locale="zh" messages={messages}>
        <PrintBarcode />
      </IntlProvider>
    </MemoryRouter>,
  );
test("a selected request opens its labels without showing an unrelated preprint form", () => {
  mount("/PrintBarcode?labNumber=DEMO-12");
  expect(screen.getByText("当前申请：DEMO-12")).toBeVisible();
  expect(screen.queryByRole("tab")).toBeNull();
});
test("the preprint menu opens the batch tool by default", () => {
  mount("/PrintBarcode?mode=preprint");
  expect(screen.getByRole("tab", { name: "条码批量预印" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  expect(screen.getByText("预印工具")).toBeVisible();
});
