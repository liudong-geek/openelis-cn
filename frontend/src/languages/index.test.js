import { describe, expect, test } from "vitest";
import { buildLanguagesFromConfig, defaultLanguages } from "./index";

describe("China delivery language profile", () => {
  test("exposes only Simplified Chinese before backend configuration loads", () => {
    expect(Object.keys(defaultLanguages)).toEqual(["zh"]);
    expect(Object.keys(buildLanguagesFromConfig())).toEqual(["zh"]);
  });

  test("does not re-enable English from an older multi-language database", () => {
    const enabled = buildLanguagesFromConfig([
      { localeCode: "en", displayName: "English", fallback: true },
      { localeCode: "fr", displayName: "Français", fallback: false },
      { localeCode: "zh_CN", displayName: "简体中文", fallback: false },
    ]);

    expect(Object.keys(enabled)).toEqual(["zh"]);
    expect(enabled.zh.label).toBe("简体中文");
    expect(enabled.zh.fallback).toBe(true);
  });
});
