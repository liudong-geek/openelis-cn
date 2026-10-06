import React, { useState } from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { waitFor } from "@testing-library/dom";
import { IntlProvider } from "react-intl";
import messages from "../../../languages/zh.json";
import NceFileAttachment from "./NceFileAttachment";
const changes = vi.fn();
function Harness({ disabled = false }) {
  const [files, setFiles] = useState([]);
  return (
    <IntlProvider locale="zh" messages={messages}>
      <NceFileAttachment
        disabled={disabled}
        attachments={files}
        onAttachmentsChange={(next) => {
          changes(next);
          setFiles(next);
        }}
      />
    </IntlProvider>
  );
}
beforeEach(() => changes.mockReset());
const pick = (container, files) =>
  fireEvent.change(container.querySelector('input[type="file"]'), {
    target: { files },
  });
test("selecting two valid files preserves both actual File identities rather than the last one", async () => {
  const { container } = render(<Harness />);
  const one = new File(["first"], "first.txt", { type: "text/plain" });
  const two = new File(["second"], "second.txt", { type: "text/plain" });
  pick(container, [one, two]);
  await waitFor(() =>
    expect(changes.mock.calls.at(-1)[0].map((a) => a.file)).toEqual([one, two]),
  );
  expect(screen.getByText("first.txt")).toBeVisible();
  expect(screen.getByText("second.txt")).toBeVisible();
  fireEvent.click(
    screen.getAllByRole("button", { name: messages["label.button.remove"] })[0],
  );
  expect(changes.mock.calls.at(-1)[0].map((a) => a.file)).toEqual([two]);
});
test("a second selection appends to the previous immutable attachment list", async () => {
  const { container } = render(<Harness />);
  const one = new File(["first"], "first.txt", { type: "text/plain" });
  const two = new File(["second"], "second.txt", { type: "text/plain" });
  pick(container, [one]);
  await waitFor(() => expect(changes).toHaveBeenCalledTimes(1));
  const first = changes.mock.calls[0][0];
  Object.freeze(first);
  pick(container, [two]);
  await waitFor(() =>
    expect(changes.mock.calls.at(-1)[0].map((a) => a.file)).toEqual([one, two]),
  );
  expect(first).toHaveLength(1);
});
test("unknown or submitting disabled state prevents adding or removing local files", () => {
  const { container } = render(<Harness disabled />);
  const file = new File(["text"], "disabled.txt", { type: "text/plain" });
  pick(container, [file]);
  expect(changes).not.toHaveBeenCalled();
  expect(
    screen.queryByRole("button", { name: messages["label.button.remove"] }),
  ).not.toBeInTheDocument();
});
