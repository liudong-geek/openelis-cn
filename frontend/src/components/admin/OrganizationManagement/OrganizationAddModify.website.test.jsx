import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { waitFor } from "@testing-library/dom";
import { IntlProvider } from "react-intl";
import { MemoryRouter } from "react-router-dom";
import OrganizationAddModify from "./OrganizationAddModify";
import messages from "../../../languages/zh_CN.json";

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock("../../utils/Utils", () => ({
  getFromOpenElisServer: api.get,
  postToOpenElisServerJsonResponse: api.post,
}));
vi.mock("../../layout/Layout", async () => {
  const { createContext } = await import("react");
  return {
    NotificationContext: createContext({
      notificationVisible: false,
      setNotificationVisible: vi.fn(),
      addNotification: vi.fn(),
    }),
    ConfigurationContext: createContext({ configurationProperties: {} }),
  };
});

function setup() {
  api.get.mockImplementation((url, done) => {
    if (url.includes("/rest/Organization?")) {
      done({
        id: "42",
        organizationName: "演示医院检验科",
        shortName: "检验科",
        isActive: "Y",
        lastupdated: "2026-10-09T01:00:00",
        selectedTypes: ["1"],
        orgTypes: [{ id: "1", name: "hospital" }],
        internetAddress: "",
      });
    } else if (url.includes("ACTIVE_ORG_LIST")) done([]);
  });
  render(
    <MemoryRouter>
      <IntlProvider locale="zh-CN" messages={messages}>
        <OrganizationAddModify embedded organizationId="42" />
      </IntlProvider>
    </MemoryRouter>,
  );
  const website = screen.getByLabelText(
    messages["organization.internetaddress"],
  );
  const save = () =>
    screen.getByRole("button", {
      name: messages["label.button.save"],
      exact: true,
    });
  return { website, save };
}

beforeEach(() => vi.clearAllMocks());

test.each([
  ["private IP with port and path", "http://10.42.0.8:18080/lis/results"],
  ["intranet hostname with query", "http://lis:8080/results?group=1"],
  ["bracketed IPv6", "http://[fd00::8]:18080/lis/results"],
  ["exact 40-character website", "https://lis.example.org/r?group=12345678"],
  ["public HTTPS with query", "https://lis.example.org/r?group=1"],
])(
  "the actual editor submits %s with unchanged identity and value",
  (_name, value) => {
    const { website, save } = setup();
    expect(save()).toBeDisabled();
    fireEvent.change(website, { target: { value } });
    expect(website).toHaveValue(value);
    expect(website).not.toHaveAttribute("aria-invalid", "true");
    expect(save()).toBeEnabled();
    fireEvent.click(save());
    expect(api.post).toHaveBeenCalledTimes(1);
    const [url, body] = api.post.mock.calls[0];
    expect(url).toBe("/rest/Organization?ID=42&startingRecNo=1");
    expect(JSON.parse(body)).toMatchObject({
      id: "42",
      organizationName: "演示医院检验科",
      shortName: "检验科",
      internetAddress: value,
    });
  },
);

test("41 characters retain the draft and show the Chinese length error without submitting", () => {
  const { website, save } = setup();
  const value = "https://lis.example.org/r?group=123456789";
  fireEvent.change(website, { target: { value } });
  expect(website).toHaveValue(value);
  expect(
    screen.getByText(messages["organization.internetaddress.maxlength"]),
  ).toBeVisible();
  expect(save()).toBeDisabled();
  fireEvent.click(save());
  expect(api.post).not.toHaveBeenCalled();
});

test("a bare address shows the Chinese complete-website message and cannot submit", () => {
  const { website, save } = setup();
  fireEvent.change(website, { target: { value: "10.42.0.8:8080/lis" } });
  expect(
    screen.getByText(
      messages["notification.organization.post.internetAddress"],
    ),
  ).toBeVisible();
  expect(save()).toBeDisabled();
  fireEvent.click(save());
  expect(api.post).not.toHaveBeenCalled();
});

test("a server rejection releases saving and retains the complete intranet URL for correction", async () => {
  const { website, save } = setup();
  const value = "http://lis:8080/results?group=1";
  fireEvent.change(website, { target: { value } });
  let complete;
  api.post.mockImplementation((_url, _body, done) => {
    complete = done;
  });
  fireEvent.click(save());
  act(() => complete({ status: 400, error: "Validation errors exist" }));
  await waitFor(() =>
    expect(
      screen.getByLabelText(messages["organization.internetaddress"]),
    ).toHaveValue(value),
  );
  expect(save()).toBeEnabled();
  expect(api.post).toHaveBeenCalledTimes(1);
});
