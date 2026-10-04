import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { IntlProvider } from "react-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";
import messages from "../../languages/zh.json";
import SampleSearch from "./SampleSearch";
const mocks = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("../utils/Utils", () => ({ getFromOpenElisServer: mocks.get }));
const show = (props = {}) =>
  render(
    <IntlProvider locale="zh" messages={messages}>
      <SampleSearch includeTests {...props} />
    </IntlProvider>,
  );
beforeEach(() => mocks.get.mockReset());
describe("SampleSearch request context", () => {
  it("opens the existing recent 50 list without requiring a keyword", () => {
    const onSearchResults = vi.fn(),
      onSearchStart = vi.fn();
    show({ onSearchResults, onSearchStart });
    expect(mocks.get).toHaveBeenCalledOnce();
    expect(mocks.get.mock.calls[0][0]).toBe(
      "/rest/sample-management/recent?limit=50&includeTests=true",
    );
    expect(onSearchStart).toHaveBeenCalledOnce();
    const payload = {
      accessionNumber: "",
      sampleItems: [],
      totalCount: 0,
      canCancelTests: false,
    };
    act(() => mocks.get.mock.calls[0][1](payload));
    expect(onSearchResults).toHaveBeenCalledWith(payload, null);
  });
  it("ignores a response from the earlier locale query", () => {
    const onSearchResults = vi.fn(),
      onSearchStart = vi.fn();
    const { rerender } = show({ onSearchResults, onSearchStart });
    rerender(
      <IntlProvider locale="en" messages={messages}>
        <SampleSearch
          includeTests
          onSearchResults={onSearchResults}
          onSearchStart={onSearchStart}
        />
      </IntlProvider>,
    );
    expect(mocks.get).toHaveBeenCalledTimes(2);
    const older = { accessionNumber: "", sampleItems: [{ id: "old" }] },
      newer = { accessionNumber: "", sampleItems: [{ id: "new" }] };
    act(() => mocks.get.mock.calls[1][1](newer));
    act(() => mocks.get.mock.calls[0][1](older));
    expect(onSearchResults).toHaveBeenCalledOnce();
    expect(onSearchResults).toHaveBeenCalledWith(newer, null);
  });
  it("encodes an explicit accession query after initial loading completes", () => {
    show({ onSearchResults: vi.fn() });
    act(() =>
      mocks.get.mock.calls[0][1]({ accessionNumber: "", sampleItems: [] }),
    );
    fireEvent.change(screen.getByRole("searchbox"), {
      target: { value: " HMC / A " },
    });
    fireEvent.click(screen.getByRole("button", { name: "搜索" }));
    expect(mocks.get.mock.calls[1][0]).toBe(
      "/rest/sample-management/search?accessionNumber=HMC%20%2F%20A&includeTests=true",
    );
  });
  it("does not accept a non-list response as a successful query", () => {
    const onSearchResults = vi.fn();
    show({ onSearchResults });
    act(() => mocks.get.mock.calls[0][1]({ message: "Backend English" }));
    expect(onSearchResults).toHaveBeenCalledWith(null, {
      message: messages["sample.management.search.error.general"],
    });
  });
  it("ignores a response after leaving the page", () => {
    const onSearchResults = vi.fn();
    const { unmount } = show({ onSearchResults });
    unmount();
    act(() =>
      mocks.get.mock.calls[0][1]({ accessionNumber: "", sampleItems: [] }),
    );
    expect(onSearchResults).not.toHaveBeenCalled();
  });
  it("rejects an explicit query response for another accession", () => {
    const onSearchResults = vi.fn();
    show({ onSearchResults });
    act(() =>
      mocks.get.mock.calls[0][1]({ accessionNumber: "", sampleItems: [] }),
    );
    onSearchResults.mockClear();
    fireEvent.change(screen.getByRole("searchbox"), {
      target: { value: "HMC-A" },
    });
    fireEvent.click(screen.getByRole("button", { name: "搜索" }));
    act(() =>
      mocks.get.mock.calls[1][1]({
        accessionNumber: "HMC-B",
        sampleItems: [{ id: "1", sampleAccessionNumber: "HMC-B" }],
      }),
    );
    expect(onSearchResults).toHaveBeenCalledWith(null, {
      message: messages["sample.management.search.error.general"],
    });
  });
  it("rejects rows from a different accession even when the response header matches", () => {
    const onSearchResults = vi.fn();
    show({ onSearchResults });
    act(() =>
      mocks.get.mock.calls[0][1]({ accessionNumber: "", sampleItems: [] }),
    );
    onSearchResults.mockClear();
    fireEvent.change(screen.getByRole("searchbox"), {
      target: { value: "HMC-A" },
    });
    fireEvent.click(screen.getByRole("button", { name: "搜索" }));
    act(() =>
      mocks.get.mock.calls[1][1]({
        accessionNumber: "HMC-A",
        sampleItems: [{ id: "1", sampleAccessionNumber: "HMC-B" }],
      }),
    );
    expect(onSearchResults).toHaveBeenCalledWith(null, {
      message: messages["sample.management.search.error.general"],
    });
  });
  it("reruns the last submitted query rather than an unsent edited keyword", () => {
    const onSearchResults = vi.fn();
    const { rerender } = show({ onSearchResults, refreshVersion: 0 });
    act(() =>
      mocks.get.mock.calls[0][1]({ accessionNumber: "", sampleItems: [] }),
    );
    fireEvent.change(screen.getByRole("searchbox"), {
      target: { value: "HMC-A" },
    });
    fireEvent.click(screen.getByRole("button", { name: "搜索" }));
    act(() =>
      mocks.get.mock.calls[1][1]({ accessionNumber: "HMC-A", sampleItems: [] }),
    );
    fireEvent.change(screen.getByRole("searchbox"), {
      target: { value: "HMC-B" },
    });
    rerender(
      <IntlProvider locale="zh" messages={messages}>
        <SampleSearch
          includeTests
          onSearchResults={onSearchResults}
          refreshVersion={1}
        />
      </IntlProvider>,
    );
    expect(mocks.get.mock.calls.at(-1)[0]).toBe(
      "/rest/sample-management/search?accessionNumber=HMC-A&includeTests=true",
    );
  });

  it("preserves the submitted accession and unsent input across a same-account request-context rotation", () => {
    const onSearchResults = vi.fn();
    const firstContext = {
      stamp: { identity: "same-user-session", csrf: "first" },
      current: () => true,
    };
    const { rerender } = show({
      onSearchResults,
      requestContext: firstContext,
    });
    act(() =>
      mocks.get.mock.calls[0][1]({ accessionNumber: "", sampleItems: [] }),
    );
    fireEvent.change(screen.getByRole("searchbox"), {
      target: { value: "HMC-A" },
    });
    fireEvent.click(screen.getByRole("button", { name: "搜索" }));
    act(() =>
      mocks.get.mock.calls[1][1]({ accessionNumber: "HMC-A", sampleItems: [] }),
    );
    fireEvent.change(screen.getByRole("searchbox"), {
      target: { value: "HMC-B" },
    });
    rerender(
      <IntlProvider locale="zh" messages={messages}>
        <SampleSearch
          includeTests
          onSearchResults={onSearchResults}
          requestContext={{
            stamp: { identity: "same-user-session", csrf: "rotated" },
            current: () => true,
          }}
        />
      </IntlProvider>,
    );
    expect(screen.getByRole("searchbox")).toHaveValue("HMC-B");
    expect(mocks.get.mock.calls.at(-1)[0]).toBe(
      "/rest/sample-management/search?accessionNumber=HMC-A&includeTests=true",
    );
  });
});
