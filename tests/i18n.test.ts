import assert from "node:assert/strict";
import test from "node:test";
import { LOCALE_STORAGE_KEY, messages, preferredLocale } from "../lib/i18n";

test("saved interface language overrides browser preference", () => {
  assert.equal(LOCALE_STORAGE_KEY, "github-hot-locale");
  assert.equal(preferredLocale("zh", "en-US"), "zh");
  assert.equal(preferredLocale("en", "zh-CN"), "en");
  assert.equal(preferredLocale(null, "zh-Hant-TW"), "zh");
  assert.equal(preferredLocale("invalid", "en-GB"), "en");
});

test("Chinese and English cover the same visible interface states", () => {
  assert.deepEqual(Object.keys(messages.en).sort(), Object.keys(messages.zh).sort());
  for (const locale of ["zh", "en"] as const) {
    for (const [key, value] of Object.entries(messages[locale])) {
      if (locale === "en" && key === "viewDetailsSuffix") continue;
      assert.ok(value.trim(), locale + "." + key + " must not be empty");
    }
  }
  assert.equal(messages.en.viewDetailsPrefix + "sample/project" + messages.en.viewDetailsSuffix, "View details for sample/project");
  assert.equal(messages.en.unavailableTitle, "Ranking unavailable");
  assert.equal(messages.en.noFavoritesTitle, "No saved repositories yet");
  assert.equal(messages.en.catalogUnavailable.includes("Languages"), true);
});
