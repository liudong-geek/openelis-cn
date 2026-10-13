/**
 * LocalizationSection — OGC-949 / OGC-767.
 *
 * In-context per-locale editor for a test's name / reporting name, backed by the
 * existing /rest/localizations endpoints. Covers render with a fallback field,
 * the locale-specific (no-fallback) case, and the error state.
 */

// ========== MOCKS (before imports) ==========
vi.mock("../../../utils/Utils", () => ({
  getFromOpenElisServer: vi.fn(),
  putToOpenElisServerFullResponse: vi.fn(),
}));

// ========== IMPORTS ==========
import React from "react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { IntlProvider } from "react-intl";
import LocalizationSection from "./LocalizationSection";
import {
  getFromOpenElisServer,
  putToOpenElisServerFullResponse,
} from "../../../utils/Utils";
import messages from "../../../../languages/en.json";

const LOCALES = [
  { localeCode: "en", displayName: "English", fallback: true },
  { localeCode: "fr", displayName: "French", fallback: false },
];

const REFS = {
  testId: "42",
  fields: [
    { field: "name", localizationId: "100" },
    { field: "reportingName", localizationId: "101" },
  ],
};

// name: only English -> falls back for fr. reportingName: has a fr translation.
const LOC = {
  100: { id: "100", translations: { en: "Glucose" } },
  101: { id: "101", translations: { en: "Glucose Report", fr: "Glucose FR" } },
};

const mockHappyPath = () =>
  getFromOpenElisServer.mockImplementation((url, cb) => {
    if (url.includes("supportedlocales")) {
      cb(LOCALES);
    } else if (url.includes("/rest/localizations/")) {
      const id = url.split("/rest/localizations/")[1];
      cb(LOC[id]);
    } else if (url.includes("/rest/test-catalog/")) {
      cb(REFS);
    }
  });

const renderSection = () =>
  render(
    <IntlProvider locale="en" messages={messages}>
      <LocalizationSection testId="42" />
    </IntlProvider>,
  );

beforeEach(() => {
  vi.clearAllMocks();
});

describe("LocalizationSection", () => {
  it("shows a fallback indicator for an untranslated field and the locale value for a translated one", async () => {
    mockHappyPath();
    renderSection();

    // Defaults to the first non-fallback locale (fr). 'name' has no fr value ->
    // fallback tag shown, the English value surfaces as the placeholder.
    expect(
      await screen.findByText(
        messages["label.testCatalog.localization.fallback.en"],
      ),
    ).toBeInTheDocument();
    const nameInput = document.getElementById("localization-input-name");
    expect(nameInput.value).toBe("");
    expect(nameInput.placeholder).toBe("Glucose");

    // 'reportingName' has a fr translation -> populated, no fallback tag.
    expect(
      document.getElementById("localization-input-reportingName").value,
    ).toBe("Glucose FR");
  });

  it("shows an error state when the refs fetch fails", async () => {
    getFromOpenElisServer.mockImplementation((url, cb) => {
      if (url.includes("supportedlocales")) {
        cb(LOCALES);
      } else {
        cb(undefined);
      }
    });
    renderSection();
    expect(
      await screen.findByText(
        messages["label.testCatalog.localization.loadError"],
      ),
    ).toBeInTheDocument();
  });
});

it("maintains inactive French names separately and retains other translations and unsaved drafts", async () => {
  let saveDone;
  getFromOpenElisServer.mockImplementation((url, cb) => {
    if (url === "/rest/supportedlocales")
      cb([
        {
          localeCode: "en",
          displayName: "English",
          fallback: true,
          active: true,
        },
        { localeCode: "fr", displayName: "French", active: false },
      ]);
    else if (url.includes("/rest/localizations/"))
      cb({
        translations: url.endsWith("100")
          ? { en: "Glucose", fr: "Ancien", zh_CN: "葡萄糖" }
          : { en: "Report", fr: "Compte rendu", zh_CN: "葡萄糖报告" },
      });
    else cb(REFS);
  });
  putToOpenElisServerFullResponse.mockImplementation((_url, _body, cb) => {
    saveDone = cb;
  });
  renderSection();
  const locale = await screen.findByLabelText(
    messages["label.testCatalog.localization.locale"],
  );
  expect(screen.getByRole("option", { name: /French/ })).toBeInTheDocument();
  expect(screen.getByRole("option", { name: /zh_CN/ })).toBeInTheDocument();
  fireEvent.change(locale, { target: { value: "fr" } });
  const name = document.getElementById("localization-input-name");
  const reporting = document.getElementById("localization-input-reportingName");
  fireEvent.change(reporting, { target: { value: "Draft report" } });
  fireEvent.change(name, { target: { value: "Glycémie" } });
  expect(locale).toHaveValue("fr");
  expect(name).toHaveValue("Glycémie");
  expect(name).toBeEnabled();
  fireEvent(name, new FocusEvent("focusout", { bubbles: true }));
  expect(putToOpenElisServerFullResponse).toHaveBeenCalledTimes(1);
  expect(putToOpenElisServerFullResponse.mock.calls[0][0]).toBe(
    "/rest/localizations/100/translations",
  );
  expect(JSON.parse(putToOpenElisServerFullResponse.mock.calls[0][1])).toEqual({
    en: "Glucose",
    fr: "Glycémie",
    zh_CN: "葡萄糖",
  });
  act(() => saveDone({ ok: true }));
  expect(reporting).toHaveValue("Draft report");
  fireEvent(reporting, new FocusEvent("focusout", { bubbles: true }));
  expect(putToOpenElisServerFullResponse.mock.calls[1][0]).toBe(
    "/rest/localizations/101/translations",
  );
  expect(JSON.parse(putToOpenElisServerFullResponse.mock.calls[1][1])).toEqual({
    en: "Report",
    fr: "Draft report",
    zh_CN: "葡萄糖报告",
  });
});
it("does not offer editable empty translations after an individual translation read fails", async () => {
  getFromOpenElisServer.mockImplementation((url, cb) => {
    if (url.includes("supportedlocales")) cb(LOCALES);
    else if (url.endsWith("/100")) cb(undefined);
    else if (url.endsWith("/101")) cb(LOC[101]);
    else cb(REFS);
  });
  renderSection();
  expect(
    await screen.findByText(
      messages["label.testCatalog.localization.loadError"],
    ),
  ).toBeInTheDocument();
  expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  expect(putToOpenElisServerFullResponse).not.toHaveBeenCalled();
});
