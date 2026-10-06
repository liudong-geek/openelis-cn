import React from "react";
import { render, cleanup } from "@testing-library/react";
import { within } from "@testing-library/dom";
import { IntlProvider } from "react-intl";
import chinese from "../../languages/zh.json";
import english from "../../languages/en.json";
const fixture = vi.hoisted(() => ({ patient: null }));
vi.mock("./OrderContext", () => ({
  useOrderContext: () => ({
    labNumber: "HMC26092800004",
    orderData: { patientProperties: fixture.patient },
    samples: [],
    stepProgress: {},
    isReadOnly: true,
  }),
}));
import OrderContextCard from "./OrderContextCard";
afterEach(cleanup);
test.each([
  ["zh", { firstName: "洋", lastName: "刘" }, "刘洋"],
  ["zh-CN", { firstName: "Henry", lastName: "Wang" }, "Wang Henry"],
  ["en", { firstName: "Henry", lastName: "Wang" }, "Henry Wang"],
])(
  "uses the same patient display-name rule for %s without changing identifiers",
  (locale, patient, display) => {
    fixture.patient = Object.freeze(patient);
    render(
      <IntlProvider
        locale={locale}
        messages={locale.startsWith("zh") ? chinese : english}
      >
        <OrderContextCard />
      </IntlProvider>,
    );
    expect(within(document.body).getByText(display)).toBeVisible();
    expect(within(document.body).getByText("HMC26092800004")).toBeVisible();
  },
);
