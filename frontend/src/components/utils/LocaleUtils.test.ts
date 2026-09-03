import { beforeEach, describe, expect, it } from "vitest";
import {
  getRequestLocale,
  normalizeLocaleCode,
  resolveSupportedLocale,
} from "./LocaleUtils";

describe("LocaleUtils", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it.each([
    ["zh_CN", "zh-CN"],
    ["zh-CN", "zh-CN"],
    ["en_US", "en-US"],
    ["en", "en"],
    ["fr", "fr"],
  ])("normalizes %s to a valid BCP 47 tag", (input, expected) => {
    expect(normalizeLocaleCode(input)).toBe(expected);
  });

  it("uses the base language when a regional message bundle is unavailable", () => {
    expect(resolveSupportedLocale("fr_CA", ["en", "fr", "zh"], "zh")).toBe(
      "fr",
    );
  });

  it("uses the product fallback for an unsupported language", () => {
    expect(resolveSupportedLocale("de-DE", ["en", "fr", "zh"], "zh")).toBe(
      "zh",
    );
  });

  it("forces a previously saved English preference to Chinese in the China edition", () => {
    expect(resolveSupportedLocale("en-US", ["zh"], "zh")).toBe("zh");
  });

  it("canonicalizes a legacy saved locale before sending it to the backend", () => {
    localStorage.setItem("locale", "zh_CN");

    expect(getRequestLocale()).toBe("zh-CN");
  });
});
