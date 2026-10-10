import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { IntlProvider } from "react-intl";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, vi } from "vitest";
import messages from "../../../languages/zh.json";
import { NotificationContext } from "../../layout/Layout";
import StudyMenuManagement from "./StudyMenuManagement";
import UserSessionDetailsContext from "../../../UserSessionDetailsContext";
const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock("../../utils/Utils", () => ({
  getFromOpenElisServer: mocks.get,
  postToOpenElisServerFullResponse: mocks.post,
  Roles: { GLOBAL_ADMIN: "Global Administrator" },
}));
const notification = {
  notificationVisible: false,
  setNotificationVisible: vi.fn(),
  addNotification: vi.fn(),
};
const renderPage = () =>
  render(
    <MemoryRouter>
      <IntlProvider locale="zh" messages={messages}>
        <UserSessionDetailsContext.Provider
          value={{
            userSessionDetails: {
              authenticated: true,
              userId: "study-admin",
              sessionId: "study-session",
              roles: ["Global Administrator"],
              loginLabUnit: "生化",
              userLabRolesMap: {},
            },
          }}
        >
          <NotificationContext.Provider value={notification}>
            <StudyMenuManagement />
          </NotificationContext.Provider>
        </UserSessionDetailsContext.Provider>
      </IntlProvider>
    </MemoryRouter>,
  );
beforeEach(() => {
  mocks.get.mockReset();
  mocks.post.mockReset();
});
test("retains every concurrently loaded real menu ID in reverse response order", async () => {
  const reads = [];
  mocks.get.mockImplementation((url, callback) =>
    reads.push({ url, callback }),
  );
  const { container } = renderPage();
  expect(reads).toHaveLength(12);
  const loaded = reads.map(({ url }, index) => ({
    menu: {
      elementId: url.split("/").at(-1),
      displayKey: "menu.study.title",
      isActive: index % 2 === 0,
      actionURL: `/resource/${index}`,
    },
    childMenus: [],
  }));
  await act(async () => {
    [...reads]
      .reverse()
      .forEach(({ callback }, reverseIndex) =>
        callback(loaded[loaded.length - 1 - reverseIndex]),
      );
  });
  fireEvent.click(screen.getByRole("switch", { name: "显示配置项" }));
  for (const dto of loaded)
    expect(
      container.querySelector(
        `#${dto.menu.elementId.replaceAll(".", "\\.")}_checkbox`,
      ).checked,
    ).toBe(dto.menu.isActive);
  let saved;
  mocks.post.mockImplementation((url, payload, callback) => {
    saved = JSON.parse(payload);
    callback({ status: 200, json: async () => saved });
  });
  await act(async () =>
    fireEvent.click(screen.getByRole("button", { name: "提交" })),
  );
  expect(mocks.post.mock.calls[0][0]).toBe("/rest/menu/");
  expect(saved).toHaveLength(12);
  expect(saved).toEqual(expect.arrayContaining(loaded));
  expect(
    saved.find((dto) => dto.menu.elementId === "menu_patient_create"),
  ).toEqual(loaded.find((dto) => dto.menu.elementId === "menu_patient_create"));
});
test("reads a successful persisted menu array back into the virtual root without dropping IDs", async () => {
  mocks.get.mockImplementation((url, callback) =>
    callback({
      menu: {
        elementId: url.split("/").at(-1),
        displayKey: "menu.study.title",
        isActive: true,
      },
      childMenus: [],
    }),
  );
  const { container } = renderPage();
  fireEvent.click(screen.getByRole("switch", { name: "显示配置项" }));
  fireEvent.click(container.querySelector("#menu_patient_create_checkbox"));
  mocks.post.mockImplementation((url, payload, callback) =>
    callback({ status: 200, json: async () => JSON.parse(payload) }),
  );
  await act(async () =>
    fireEvent.click(screen.getByRole("button", { name: "提交" })),
  );
  expect(
    container.querySelector("#menu_patient_create_checkbox"),
  ).not.toBeChecked();
  expect(container.querySelector("#menu_sample_create_checkbox")).toBeChecked();
  const saved = JSON.parse(mocks.post.mock.calls[0][1]);
  expect(saved).toHaveLength(12);
  expect(
    saved.find((dto) => dto.menu.elementId === "menu_patient_create").menu
      .isActive,
  ).toBe(false);
});
