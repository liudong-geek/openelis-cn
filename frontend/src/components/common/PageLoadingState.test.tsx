import React from "react";
import { render, screen } from "@testing-library/react";
import { IntlProvider } from "react-intl";
import { expect, test } from "vitest";
import PageLoadingState from "./PageLoadingState";
import messages from "../../languages/en.json";

test("announces route loading instead of rendering a blank page", () => {
  render(
    <IntlProvider locale="en" messages={messages}>
      <PageLoadingState />
    </IntlProvider>,
  );

  expect(screen.getByRole("status")).toHaveTextContent("Loading");
});
