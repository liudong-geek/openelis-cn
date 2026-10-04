import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { waitFor } from "@testing-library/dom";
import "@testing-library/jest-dom";
import { IntlProvider } from "react-intl";
import { MemoryRouter } from "react-router-dom";
import BasicInfoSection from "./BasicInfoSection";
import messages from "../../../../languages/zh_CN.json";
import {
  getFromOpenElisServer,
  putToOpenElisServerFullResponse,
  postToOpenElisServerJsonResponse,
} from "../../../utils/Utils";
vi.mock("../../../utils/Utils", () => ({
  getFromOpenElisServer: vi.fn(),
  putToOpenElisServerFullResponse: vi.fn(),
  postToOpenElisServerJsonResponse: vi.fn(),
  postToOpenElisServerFullResponse: vi.fn(),
}));
vi.mock("../../../layout/Layout", async () => {
  const React = await import("react");
  return {
    NotificationContext: React.createContext({
      addNotification: () => {},
      setNotificationVisible: () => {},
    }),
  };
});
const record = {
  testId: "42",
  name: "葡萄糖",
  code: "GLU",
  description: "原说明",
  domain: "CLINICAL",
  sampleTypeIds: ["2"],
  labUnitId: "7",
  active: true,
  orderable: true,
  antimicrobialResistance: false,
  testGuid: "immutable-guid",
};
const close = vi.fn();
const saved = vi.fn();
const configure = vi.fn();
const wrapper = (id = "42") => (
  <MemoryRouter>
    <IntlProvider locale="zh-CN" messages={messages}>
      <BasicInfoSection
        testId={id}
        embedded
        onCancel={close}
        onSaved={saved}
        onConfigure={configure}
      />
    </IntlProvider>
  </MemoryRouter>
);
const setup = (id = "42") => render(wrapper(id));
beforeEach(() => {
  vi.clearAllMocks();
  getFromOpenElisServer.mockImplementation((url, cb) => {
    if (url.endsWith("/domains"))
      cb([{ id: "CLINICAL", labelKey: "label.domain.CLINICAL" }]);
    else if (url.endsWith("/lab-units")) cb([{ id: "7", name: "生化" }]);
    else if (url.endsWith("/sample-types"))
      cb([{ id: "2", name: "血清", domain: "H" }]);
    else cb({ ...record });
  });
  putToOpenElisServerFullResponse.mockImplementation((_u, payload, cb) =>
    cb({
      ok: true,
      status: 200,
      json: async () => ({ ...record, ...JSON.parse(payload) }),
    }),
  );
});
it("loads by ID and keeps name/state read-only without activation or name writes", async () => {
  setup();
  const input = await screen.findByLabelText("名称");
  expect(input).toHaveAttribute("readonly");
  expect(
    screen.queryByRole("switch", { name: "启用" }),
  ).not.toBeInTheDocument();
  expect(postToOpenElisServerJsonResponse).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "保存" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "关联配置" }));
  expect(configure).toHaveBeenCalledTimes(1);
});
it("saves partial editable fields and keeps name active GUID out of payload", async () => {
  setup();
  await screen.findByDisplayValue("GLU");
  fireEvent.change(screen.getByLabelText("项目编码"), {
    target: { value: "GLU-2" },
  });
  fireEvent.click(screen.getByRole("button", { name: "保存" }));
  const body = JSON.parse(putToOpenElisServerFullResponse.mock.calls[0][1]);
  expect(body).toEqual({
    code: "GLU-2",
    description: "原说明",
    labUnitId: "7",
    sampleTypeIds: ["2"],
    domain: "CLINICAL",
    antimicrobialResistance: false,
    orderable: true,
  });
  await waitFor(() => expect(saved).toHaveBeenCalledTimes(1));
});
it.each([422, 409, 404])(
  "keeps failed draft and unlocks retry after %s",
  async (status) => {
    putToOpenElisServerFullResponse.mockImplementationOnce((_u, _p, cb) =>
      cb({ ok: false, status }),
    );
    setup();
    await screen.findByDisplayValue("GLU");
    fireEvent.change(screen.getByLabelText("项目编码"), {
      target: { value: "DRAFT" },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    expect(saved).not.toHaveBeenCalled();
    expect(screen.getByDisplayValue("DRAFT")).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "保存" })).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    await waitFor(() => expect(saved).toHaveBeenCalledTimes(1));
  },
);
it("dirty Cancel offers keep editing or discard without saving", async () => {
  setup();
  await screen.findByDisplayValue("GLU");
  fireEvent.change(screen.getByLabelText("项目编码"), {
    target: { value: "DRAFT" },
  });
  fireEvent.click(screen.getByRole("button", { name: "取消" }));
  expect(close).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "继续编辑" }));
  expect(screen.getByDisplayValue("DRAFT")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "关闭" }));
  fireEvent.click(screen.getByRole("button", { name: /放弃修改并返回/ }));
  expect(close).toHaveBeenCalledTimes(1);
  expect(putToOpenElisServerFullResponse).not.toHaveBeenCalled();
});
it("locks repeated Save and exit while request is pending", async () => {
  let done;
  putToOpenElisServerFullResponse.mockImplementation((_u, _p, cb) => {
    done = cb;
  });
  setup();
  await screen.findByDisplayValue("GLU");
  fireEvent.change(screen.getByLabelText("项目编码"), {
    target: { value: "DRAFT" },
  });
  fireEvent.click(screen.getByRole("button", { name: "保存" }));
  fireEvent.click(
    screen.getByRole("button", { name: messages["label.button.saving"] }),
  );
  fireEvent.click(screen.getByRole("button", { name: "关闭" }));
  expect(putToOpenElisServerFullResponse).toHaveBeenCalledTimes(1);
  expect(close).not.toHaveBeenCalled();
  expect(screen.getByLabelText("项目编码")).toBeDisabled();
  act(() =>
    done({
      ok: true,
      status: 200,
      json: async () => ({ ...record, code: "DRAFT" }),
    }),
  );
  await waitFor(() => expect(saved).toHaveBeenCalledTimes(1));
});
it("retries complete record loading after failure", async () => {
  let calls = 0;
  getFromOpenElisServer.mockImplementation((url, cb) => {
    if (url.endsWith("basic-info")) cb(++calls === 1 ? null : record);
    else
      cb(
        url.endsWith("/sample-types")
          ? [{ id: "2", name: "血清" }]
          : url.endsWith("/lab-units")
            ? [{ id: "7", name: "生化" }]
            : [],
      );
  });
  setup();
  await screen.findByText("检验项目加载失败，请重试。");
  fireEvent.click(screen.getByRole("button", { name: "重新加载" }));
  expect(await screen.findByDisplayValue("GLU")).toBeInTheDocument();
});
it("ignores late read from previous object and late save after unmount", async () => {
  const reads = [];
  getFromOpenElisServer.mockImplementation((url, cb) => {
    if (url.endsWith("basic-info")) reads.push(cb);
    else
      cb(
        url.endsWith("/sample-types")
          ? [{ id: "2", name: "血清" }]
          : url.endsWith("/lab-units")
            ? [{ id: "7", name: "生化" }]
            : [],
      );
  });
  const rendered = setup("42");
  rendered.rerender(wrapper("43"));
  act(() => reads[1]({ ...record, testId: "43", code: "NEW" }));
  act(() => reads[0]({ ...record, code: "STALE" }));
  expect(await screen.findByDisplayValue("NEW")).toBeInTheDocument();
  expect(screen.queryByDisplayValue("STALE")).not.toBeInTheDocument();
  let done;
  putToOpenElisServerFullResponse.mockImplementation((_u, _p, cb) => {
    done = cb;
  });
  fireEvent.change(screen.getByLabelText("项目编码"), {
    target: { value: "DRAFT" },
  });
  fireEvent.click(screen.getByRole("button", { name: "保存" }));
  rendered.unmount();
  act(() =>
    done({
      ok: true,
      status: 200,
      json: async () => ({ ...record, code: "DRAFT" }),
    }),
  );
  expect(saved).not.toHaveBeenCalled();
});
it("disables save when reference options fail to load", async () => {
  getFromOpenElisServer.mockImplementation((url, cb) =>
    cb(url.endsWith("basic-info") ? record : undefined),
  );
  setup();
  await screen.findByDisplayValue("GLU");
  fireEvent.change(screen.getByLabelText("项目编码"), {
    target: { value: "DRAFT" },
  });
  expect(screen.getByRole("button", { name: "保存" })).toBeDisabled();
});

it("dirty Escape retains the modal and prompts without writes", async () => {
  setup();
  await screen.findByDisplayValue("GLU");
  fireEvent.change(screen.getByLabelText("项目编码"), {
    target: { value: "DRAFT" },
  });
  fireEvent.keyDown(document, { key: "Escape", keyCode: 27 });
  await screen.findByRole("heading", { name: "尚有未保存的修改" });
  expect(close).not.toHaveBeenCalled();
  expect(screen.getByRole("dialog")).toBeVisible();
  expect(putToOpenElisServerFullResponse).not.toHaveBeenCalled();
});

it("keeps unknown original sample identity and refuses lossy basic save", async () => {
  getFromOpenElisServer.mockImplementation((url, cb) => {
    if (url.endsWith("basic-info"))
      cb({ ...record, sampleTypeIds: ["2", "missing"] });
    else if (url.endsWith("/sample-types")) cb([{ id: "2", name: "血清" }]);
    else if (url.endsWith("/lab-units")) cb([{ id: "7", name: "生化" }]);
    else cb([]);
  });
  setup();
  await screen.findByDisplayValue("GLU");
  expect(screen.getByRole("button", { name: "保存" })).toBeDisabled();
  expect(putToOpenElisServerFullResponse).not.toHaveBeenCalled();
});

it("retries only references and retains the dirty draft", async () => {
  let attempts = 0;
  getFromOpenElisServer.mockImplementation((url, cb) => {
    if (url.endsWith("basic-info")) cb(record);
    else if (url.endsWith("/sample-types"))
      cb(++attempts === 1 ? undefined : [{ id: "2", name: "血清" }]);
    else if (url.endsWith("/lab-units")) cb([{ id: "7", name: "生化" }]);
    else cb([]);
  });
  setup();
  await screen.findByDisplayValue("GLU");
  fireEvent.change(screen.getByLabelText("项目编码"), {
    target: { value: "DRAFT" },
  });
  expect(screen.getByRole("button", { name: "保存" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "重新加载" }));
  expect(screen.getByDisplayValue("DRAFT")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "保存" })).toBeEnabled();
  expect(
    getFromOpenElisServer.mock.calls.filter(([url]) =>
      url.endsWith("basic-info"),
    ),
  ).toHaveLength(1);
});
it.each(["basic-info-edit-lab-unit", "basic-info-edit-sample-types"])(
  "first Escape closes expanded %s before dirty discard",
  async (id) => {
    const { container } = setup();
    await screen.findByDisplayValue("GLU");
    fireEvent.change(screen.getByLabelText("项目编码"), {
      target: { value: "DRAFT" },
    });
    const element = container.ownerDocument.getElementById(id);
    const input =
      element.tagName === "INPUT" ? element : element.querySelector("input");
    const listBox = input.closest(".cds--list-box");
    fireEvent.click(input);
    await waitFor(() => expect(listBox).toHaveClass("cds--list-box--expanded"));
    fireEvent.keyDown(input, { key: "Escape", keyCode: 27 });
    await waitFor(() =>
      expect(listBox).not.toHaveClass("cds--list-box--expanded"),
    );
    expect(
      screen.queryByRole("heading", { name: "尚有未保存的修改" }),
    ).not.toBeInTheDocument();
    expect(close).not.toHaveBeenCalled();
    fireEvent.keyDown(input, { key: "Escape", keyCode: 27 });
    expect(
      await screen.findByRole("heading", { name: "尚有未保存的修改" }),
    ).toBeInTheDocument();
  },
);

it.each([
  undefined,
  { ok: false, status: 0 },
  { ok: true, status: 200, redirected: true },
])(
  "verifies complete server state after an uncertain response (%s) without repeating PUT",
  async (response) => {
    let written = false;
    putToOpenElisServerFullResponse.mockImplementation(
      (_url, _body, callback) => {
        written = true;
        callback(response);
      },
    );
    getFromOpenElisServer.mockImplementation((url, cb) => {
      if (url.endsWith("basic-info"))
        cb({ ...record, code: written ? "DRAFT" : "GLU" });
      else if (url.endsWith("/sample-types")) cb([{ id: "2", name: "血清" }]);
      else if (url.endsWith("/lab-units")) cb([{ id: "7", name: "生化" }]);
      else cb([]);
    });
    setup();
    await screen.findByDisplayValue("GLU");
    fireEvent.change(screen.getByLabelText("项目编码"), {
      target: { value: "DRAFT" },
    });
    fireEvent.click(screen.getByRole("button", { name: "保存" }));
    await waitFor(() => expect(saved).toHaveBeenCalledTimes(1));
    expect(putToOpenElisServerFullResponse).toHaveBeenCalledTimes(1);
    expect(
      getFromOpenElisServer.mock.calls.filter(([url]) =>
        url.endsWith("basic-info"),
      ),
    ).toHaveLength(2);
  },
);
it("retains a draft when a complete reread proves the requested changes were not written", async () => {
  putToOpenElisServerFullResponse.mockImplementationOnce(
    (_url, _body, callback) => callback(undefined),
  );
  setup();
  await screen.findByDisplayValue("GLU");
  fireEvent.change(screen.getByLabelText("项目编码"), {
    target: { value: "DRAFT" },
  });
  fireEvent.click(screen.getByRole("button", { name: "保存" }));
  await screen.findByText(messages["admin.basicEdit.update.notConfirmed"]);
  expect(saved).not.toHaveBeenCalled();
  expect(screen.getByDisplayValue("DRAFT")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "保存" })).toBeEnabled();
  expect(putToOpenElisServerFullResponse).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("button", { name: "保存" }));
  await waitFor(() => expect(saved).toHaveBeenCalledTimes(1));
  expect(putToOpenElisServerFullResponse).toHaveBeenCalledTimes(2);
});
it("locks PUT and fields while unknown-write verification fails, retrying GET only for failure and projection", async () => {
  let reads = 0;
  putToOpenElisServerFullResponse.mockImplementation((_url, _body, cb) =>
    cb(undefined),
  );
  getFromOpenElisServer.mockImplementation((url, cb) => {
    if (url.endsWith("basic-info")) {
      reads += 1;
      cb(
        reads === 2
          ? undefined
          : reads === 3
            ? { testId: "42", name: "葡萄糖", sampleTypeIds: ["2"] }
            : { ...record, code: reads > 3 ? "DRAFT" : "GLU" },
      );
    } else if (url.endsWith("/sample-types")) cb([{ id: "2", name: "血清" }]);
    else if (url.endsWith("/lab-units")) cb([{ id: "7", name: "生化" }]);
    else cb([]);
  });
  setup();
  await screen.findByDisplayValue("GLU");
  fireEvent.change(screen.getByLabelText("项目编码"), {
    target: { value: "DRAFT" },
  });
  fireEvent.click(screen.getByRole("button", { name: "保存" }));
  await screen.findByText(
    messages["admin.basicEdit.update.verificationFailed"],
  );
  expect(
    screen.queryByRole("button", { name: "保存" }),
  ).not.toBeInTheDocument();
  expect(screen.getByLabelText("项目编码")).toBeDisabled();
  expect(screen.getByDisplayValue("DRAFT")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "重新加载" }));
  await waitFor(() => expect(reads).toBe(3));
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "重新加载" })).toBeEnabled(),
  );
  expect(saved).not.toHaveBeenCalled();
  expect(putToOpenElisServerFullResponse).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("button", { name: "重新加载" }));
  await waitFor(() => expect(saved).toHaveBeenCalledTimes(1));
  expect(putToOpenElisServerFullResponse).toHaveBeenCalledTimes(1);
});
it("rejects a same-ID detail projection without writing defaulted fields", async () => {
  getFromOpenElisServer.mockImplementation((url, cb) =>
    cb(
      url.endsWith("basic-info")
        ? { testId: "42", name: "葡萄糖", sampleTypeIds: ["2"] }
        : [],
    ),
  );
  setup();
  await screen.findByText("检验项目加载失败，请重试。");
  expect(screen.queryByLabelText("项目编码")).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "保存" })).toBeDisabled();
  expect(putToOpenElisServerFullResponse).not.toHaveBeenCalled();
});
it("keeps actual nullable fields and verifies association IDs regardless of backend read order", async () => {
  const nullable = {
    ...record,
    description: null,
    code: null,
    labUnitId: null,
    domain: null,
    active: false,
    orderable: false,
    sampleTypeIds: ["2", "3"],
  };
  let written = false;
  getFromOpenElisServer.mockImplementation((url, cb) => {
    if (url.endsWith("basic-info"))
      cb(
        written
          ? { ...nullable, description: "说明", sampleTypeIds: ["3", "2"] }
          : nullable,
      );
    else if (url.endsWith("/sample-types"))
      cb([
        { id: "2", name: "血清" },
        { id: "3", name: "血浆" },
      ]);
    else cb([]);
  });
  putToOpenElisServerFullResponse.mockImplementation((_url, _body, cb) => {
    written = true;
    cb(undefined);
  });
  setup();
  await screen.findByLabelText("项目编码");
  fireEvent.change(screen.getByLabelText("描述"), {
    target: { value: "说明" },
  });
  fireEvent.click(screen.getByRole("button", { name: "保存" }));
  await waitFor(() => expect(saved).toHaveBeenCalledTimes(1));
});
it("does not accept a different writable field when ID and name match an uncertain save", async () => {
  let reads = 0;
  getFromOpenElisServer.mockImplementation((url, cb) => {
    if (url.endsWith("basic-info"))
      cb(++reads > 1 ? { ...record, code: "DRAFT", orderable: false } : record);
    else if (url.endsWith("/sample-types")) cb([{ id: "2", name: "血清" }]);
    else if (url.endsWith("/lab-units")) cb([{ id: "7", name: "生化" }]);
    else cb([]);
  });
  putToOpenElisServerFullResponse.mockImplementation((_url, _body, cb) =>
    cb(undefined),
  );
  setup();
  await screen.findByDisplayValue("GLU");
  fireEvent.change(screen.getByLabelText("项目编码"), {
    target: { value: "DRAFT" },
  });
  fireEvent.click(screen.getByRole("button", { name: "保存" }));
  await screen.findByText(messages["admin.basicEdit.update.notConfirmed"]);
  expect(saved).not.toHaveBeenCalled();
  expect(screen.getByDisplayValue("DRAFT")).toBeInTheDocument();
});
it("ignores a previous object's verification read after test ID changes", async () => {
  let resolveVerification;
  let readCount = 0;
  getFromOpenElisServer.mockImplementation((url, cb) => {
    if (url.endsWith("/42/basic-info")) {
      if (++readCount === 1) cb(record);
      else resolveVerification = cb;
    } else if (url.endsWith("/43/basic-info"))
      cb({ ...record, testId: "43", code: "NEW" });
    else if (url.endsWith("/sample-types")) cb([{ id: "2", name: "血清" }]);
    else if (url.endsWith("/lab-units")) cb([{ id: "7", name: "生化" }]);
    else cb([]);
  });
  putToOpenElisServerFullResponse.mockImplementation((_url, _body, cb) =>
    cb(undefined),
  );
  const rendered = setup("42");
  await screen.findByDisplayValue("GLU");
  fireEvent.change(screen.getByLabelText("项目编码"), {
    target: { value: "DRAFT" },
  });
  fireEvent.click(screen.getByRole("button", { name: "保存" }));
  await waitFor(() => expect(resolveVerification).toBeTypeOf("function"));
  rendered.rerender(wrapper("43"));
  await screen.findByDisplayValue("NEW");
  await act(async () => resolveVerification({ ...record, code: "DRAFT" }));
  expect(screen.getByDisplayValue("NEW")).toBeInTheDocument();
  expect(screen.queryByDisplayValue("DRAFT")).not.toBeInTheDocument();
  expect(saved).not.toHaveBeenCalled();
});
it("ignores a late successful response body after unmount without starting verification", async () => {
  let resolveBody;
  putToOpenElisServerFullResponse.mockImplementation((_url, _body, cb) =>
    cb({
      ok: true,
      status: 200,
      json: () =>
        new Promise((resolve) => {
          resolveBody = resolve;
        }),
    }),
  );
  const rendered = setup();
  await screen.findByDisplayValue("GLU");
  fireEvent.change(screen.getByLabelText("项目编码"), {
    target: { value: "DRAFT" },
  });
  fireEvent.click(screen.getByRole("button", { name: "保存" }));
  await waitFor(() => expect(resolveBody).toBeTypeOf("function"));
  const calls = getFromOpenElisServer.mock.calls.length;
  rendered.unmount();
  await act(async () => resolveBody({ ...record, code: "DRAFT" }));
  expect(saved).not.toHaveBeenCalled();
  expect(getFromOpenElisServer).toHaveBeenCalledTimes(calls);
});
